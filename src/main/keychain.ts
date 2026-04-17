import keytar from "keytar";

const SERVICE = "Deployer";
const ACCOUNT = "vercel-token";

export async function getToken(): Promise<string | null> {
  return keytar.getPassword(SERVICE, ACCOUNT);
}

export async function setToken(token: string): Promise<void> {
  await keytar.setPassword(SERVICE, ACCOUNT, token);
}

export async function clearToken(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}
