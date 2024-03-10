import { authenticate } from "@google-cloud/local-auth";
import path from "path";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();


const takeConsent = async (userId: string, gmail: string) => {
  const { email } = await authorize(userId, gmail);
  // const gmailId = await getUserProfile(auth);
  return email;
};

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(
  client: OAuth2Client,
  adminId: string,
  email: string
): Promise<void> {
  try {
    const existingToken = await prisma.gmailApiToken.findUnique({
      where: { email: email },
    });
    if (existingToken) {
      await prisma.gmailApiToken.update({
        where: { email: email },
        data: {
          user_id: adminId,
          client_id: client._clientId as string,
          sclient_secret: client._clientSecret as string,
          refresh_token: client.credentials.refresh_token as string,
        },
      });
    } else {
      await prisma.gmailApiToken.create({
        data: {
          user_id: adminId,
          email: email,
          client_id: client._clientId as string,
          sclient_secret: client._clientSecret as string,
          refresh_token: client.credentials.refresh_token as string,
        },
      });
    }
  } catch (error) {
    console.log(error);
    throw new Error("Error while saving credentials");
  }
}

const authorize = async (userId: string, gmail: string) => {
  try {
    const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
    const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

    let client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    const email = await getUserProfile(client);
    console.log(email);
    if(!email){
      throw new Error("not found User Details")
    }
    if (client.credentials) {
      await saveCredentials(client, userId, gmail);
    } else {
      throw new Error("client credentials not found");
    }
    return {client, email};
  } catch (error: any) {
    throw new Error("Internal server error: " + error.message);
  }
};

async function getUserProfile(auth: any) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.getProfile({
    userId: "me",
  });
  // This will return the user's Gmail ID
  if (res.data.emailAddress) return res.data.emailAddress;
  return null;
}

export const takeConsentService = {
  takeConsent
}
