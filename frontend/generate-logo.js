const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

async function generateLogo() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `
Minimal professional logo for an engineering education platform called "Bridge4ER".
Icon: modern bridge structure combined with a graduation cap.
Style: clean, startup-style, vector logo.
Colors: blue gradient, white background.
Typography: modern sans-serif.
Flat design suitable for website and favicon.
`;

  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
  });

  const imageBase64 = result?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("No image data returned from OpenAI.");
  }

  const imageBytes = Buffer.from(imageBase64, "base64");
  const outputPath = path.join(__dirname, "public", "bridge4er-logo.png");
  fs.writeFileSync(outputPath, imageBytes);

  console.log(`Logo saved as ${outputPath}`);
}

generateLogo().catch((error) => {
  console.error("Logo generation failed:", error.message);
  process.exit(1);
});
