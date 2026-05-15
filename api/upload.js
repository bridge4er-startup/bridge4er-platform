import { put } from "@vercel/blob";

function getFileName(req) {
  const headerName = req.headers["x-file-name"];
  if (headerName) return headerName;
  const url = new URL(req.url, "http://localhost");
  const queryName = url.searchParams.get("filename");
  if (queryName) return queryName;
  return `upload-${Date.now()}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }

    if (!buffers.length) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const fileName = getFileName(req);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const buffer = Buffer.concat(buffers);

    const blob = await put(fileName, buffer, {
      access: "public",
      contentType
    });

    res.status(200).json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: blob.size
    });
  } catch (err) {
    res.status(500).json({ error: "Upload failed" });
  }
}
