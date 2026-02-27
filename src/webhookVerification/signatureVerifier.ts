import { verifyAsync } from "@noble/ed25519";

export async function verifyEd25519Signature(
  rawBody: Buffer,
  signatureBase64: string,
  publicKeyBase64: string,
): Promise<boolean> {
  const signatureBuffer = Buffer.from(signatureBase64, "base64");
  const publicKeyBuffer = Buffer.from(publicKeyBase64, "base64");

  return verifyAsync(signatureBuffer, rawBody, publicKeyBuffer);
}
