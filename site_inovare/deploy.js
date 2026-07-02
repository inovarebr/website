const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const objectStorage = require("oci-objectstorage");
const common = require("oci-common");

const DIST_DIR = path.join(__dirname, "dist");
const BUCKET_NAME = "inovare_website";
const CONCURRENCY = 5;

// Equivalente ao --auto-content-type da OCI CLI para extensões mais comuns do site.
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function normalizePrivateKey(rawKey) {
  // Suporta secret armazenada com "\n" literal sem quebrar quando já vem com quebra real.
  if (rawKey.includes("\\n")) {
    return rawKey.replace(/\\n/g, "\n");
  }
  return rawKey;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function getCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    // HTML deve ser revalidado para refletir alterações de conteúdo rapidamente.
    return "no-cache, no-store, must-revalidate";
  }
  // Assets estáticos podem ficar em cache longo para melhor performance.
  return "public, max-age=31536000, immutable";
}

async function collectFilesRecursively(dir, rootDir = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFilesRecursively(absolutePath, rootDir);
      files.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: path.relative(rootDir, absolutePath).split(path.sep).join("/")
      });
    }
  }

  return files;
}

async function runWithConcurrency(items, limit, worker) {
  // Pool simples de workers para limitar chamadas simultâneas à API.
  let cursor = 0;
  const errors = [];

  async function workerLoop() {
    while (true) {
      const current = cursor;
      cursor += 1;
      if (current >= items.length) {
        return;
      }

      try {
        await worker(items[current], current);
      } catch (error) {
        errors.push({ item: items[current], error });
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => workerLoop());
  await Promise.all(workers);

  if (errors.length > 0) {
    const details = errors
      .map(({ item, error }) => `- ${item.relativePath}: ${error.message}`)
      .join("\n");
    throw new Error(`Falha ao enviar ${errors.length} arquivo(s):\n${details}`);
  }
}

async function createObjectStorageClient() {
  const user = getRequiredEnv("OCI_CLI_USER");
  const tenancy = getRequiredEnv("OCI_CLI_TENANCY");
  const fingerprint = getRequiredEnv("OCI_CLI_FINGERPRINT");
  const keyContent = normalizePrivateKey(getRequiredEnv("OCI_CLI_KEY_CONTENT"));
  const region = getRequiredEnv("OCI_CLI_REGION");

  const authProvider = new common.SimpleAuthenticationDetailsProvider(
    tenancy,
    user,
    fingerprint,
    keyContent,
    null,
    null
  );

  const client = new objectStorage.ObjectStorageClient({
    authenticationDetailsProvider: authProvider
  });

  // Endpoint explícito para evitar depender de arquivo ~/.oci/config no runner.
  client.endpoint = `https://objectstorage.${region}.oraclecloud.com`;
  return client;
}

async function uploadFile(client, namespaceName, fileInfo) {
  const body = fs.createReadStream(fileInfo.absolutePath);
  const contentType = getContentType(fileInfo.absolutePath);
  const cacheControl = getCacheControl(fileInfo.absolutePath);

  await client.putObject({
    namespaceName,
    bucketName: BUCKET_NAME,
    objectName: fileInfo.relativePath,
    putObjectBody: body,
    contentType,
    cacheControl
  });
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`Pasta de build não encontrada: ${DIST_DIR}`);
  }

  const files = await collectFilesRecursively(DIST_DIR);
  if (files.length === 0) {
    console.log("Nenhum arquivo encontrado em dist/. Nada para publicar.");
    return;
  }

  console.log(`Arquivos para upload: ${files.length}`);
  const client = await createObjectStorageClient();

  const namespaceResponse = await client.getNamespace({});
  const namespaceName = namespaceResponse.value;
  console.log(`Namespace OCI detectado: ${namespaceName}`);

  let uploaded = 0;
  await runWithConcurrency(files, CONCURRENCY, async (fileInfo) => {
    await uploadFile(client, namespaceName, fileInfo);
    uploaded += 1;
    console.log(`[${uploaded}/${files.length}] Upload concluído: ${fileInfo.relativePath}`);
  });

  console.log(`Deploy concluído com sucesso. ${uploaded} arquivo(s) enviados para ${BUCKET_NAME}.`);
}

main().catch((error) => {
  console.error("Erro no deploy para OCI Object Storage:");
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
