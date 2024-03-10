// import { promises as fs } from "fs";
import path from "path";
import { prisma } from "src/utility";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import { Response } from "express";
import { OAuth2Client } from "google-auth-library";
import token from "./../../token.json"
import axios from "axios";
import { Buffer } from "buffer";
import * as cheerio from "cheerio"
import { IAuthJWTRequest } from "src/common/interfaces";
const { gmailRecords: GmailRecords, gmailApiToken: GmailApiToken } = prisma;

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
// const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client: OAuth2Client, adminId: string, gmail: string): Promise<void> {
  try {
    const existingToken = await GmailApiToken.findUnique({ where: { email: gmail } });
    if (existingToken) {
      await GmailApiToken.update({
        where: { email: gmail },
        data: {
          admin_id: adminId,
          client_id: client._clientId as string,
          client_secret: client._clientSecret as string,
          refresh_token: client.credentials.refresh_token as string,
        },
      });
    } else {
      await GmailApiToken.create({
        data: {
          admin_id: adminId,
          email: gmail,
          client_id: client._clientId as string,
          client_secret: client._clientSecret as string,
          refresh_token: client.credentials.refresh_token as string,
        },
      });
    }
  } catch (error) {
    console.log(error);
    throw new Error("error getting to creating the record");
  }
}

async function authorize(adminId: string, gmail: string) {
  try {
    let client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
      await saveCredentials(client, adminId, gmail);
    }
    return client;
  } catch (error) {
    console.error("Authentication error:", error);
    throw new Error("Authentication failed. Please try again.");
  }
}

/**
 * Retrieves the user's profile information.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function getUserProfile(auth: any) {
  try {
    const gmail = google.gmail({ version: "v1", auth });
    const res = await gmail.users.getProfile({
      userId: "me",
    });
    return res.data.emailAddress; // This will return the user's Gmail ID
  } catch (error) {
    console.log(error);
    throw new Error("error getting to get user profile");
  }
}

const takeConsent = async (req: IAuthJWTRequest, res: Response) => {
  try {
    const adminId = req.user.id;
    const gmail = req.params.email;
    const auth = await authorize(adminId, gmail);
    // const labels: people_v1.Schema$Person = await listLabels(auth) || [];
    const gmailId = await getUserProfile(auth); // Retrieve Gmail ID

    res.status(200).json({
      status: true,
      data: gmailId
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: 'An error occurred while fetching Gmail labels.' });
  }
};













const oAuth2Client = new google.auth.OAuth2(
  token.client_id,
  token.client_secret,
  process.env.REDIRECT_URI,
);
oAuth2Client.setCredentials({ refresh_token: token.refresh_token });

const createConfig = (url: string, accessToken: any) => {
  return {
    method: 'get',
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-type': 'application/json'
    },
  }
};

const mailList = async (req: IAuthJWTRequest, res: Response) => {
  try {
    const recipientEmail = req.params.email;
    const senderEmail = "mikeblakeyy@gmail.com";
    // const url = `https://gmail.googleapis.com/gmail/v1/users/${req.params.email}/threads/18e0cce0d1f202da`;
    // const url = `https://gmail.googleapis.com/gmail/v1/users/${recipientEmail}/messages?maxResults=10&q=from:${senderEmail}+is:unread`;
    const url = `https://gmail.googleapis.com/gmail/v1/users/${recipientEmail}/messages?maxResults=10&q=from:${senderEmail}`;
    const { token } = await oAuth2Client.getAccessToken();
    const config = createConfig(url, token);
    const response = await axios(config);

    const mailDetails = response?.data?.messages?.map(async (message: any) => {
      const url = `https://gmail.googleapis.com/gmail/v1/users/${req.params.email}/messages/${message.id}`;
      const config = createConfig(url, token);
      const response = await axios(config);
      return response?.data;
    })
    const mailList = await Promise.all(mailDetails);
    // console.log(responseD)
    const recordCreated = mailList.map(async (mail) => {
      const toDetail = mail.payload.headers.find((detail: any) => detail.name === "To");
      const subjectDetail = mail.payload.headers.find((detail: any) => detail.name === "Subject");
      const dateDetail = mail.payload.headers.find((detail: any) => detail.name === "Date");

      const to = toDetail ? toDetail.value : "";
      const subject = subjectDetail ? subjectDetail.value : "";
      const date = dateDetail ? dateDetail.value : "";
      // console.log("To:", to);
      // console.log("Subject:", subject);
      // console.log("Date:", date);

      const bodyData = mail.payload.parts[1].body.data;
      let base64Data = bodyData.replace(/-/g, '+').replace(/_/g, '/');
      const text = Buffer.from(base64Data, 'base64').toString('utf-8');
      // console.log("text", text);
      const $ = cheerio.load(text);

      // const status = $('td:contains("Received")').text().trim().replace(/\s+/g, '');
      const status = $('td:contains("Received"):last').text().trim() || $('td:contains("Failed"):last').text().trim() || $('td:contains("To received"):last').text().trim() || "status";
      console.log(status);

      return await GmailRecords.upsert({
        where: { message_id: mail.id },
        update: {
          recipientEmail: to || "",
          senderEmail: senderEmail || "",
          subject: subject || "",
          date: date || "",
          status: status || "",
          text: text || " "
        },
        create: {
          message_id: mail.id || "",
          recipientEmail: to || "",
          senderEmail: senderEmail || "",
          subject: subject || "",
          date: date || "",
          status: status || "",
          admin_id: "4c9285bb-4b4e-4cad-b0a1-f0077a240cd6",
          text: text || " "
        },
      });
    })
    const record = await Promise.all(recordCreated);
    res.json({ data: record });
  } catch (error) {
    console.log(error);
    res.send(error);
  }
}

const getMailList = async (req: IAuthJWTRequest, res: Response) => {
  try {
    const admin_id = req.user.id
    console.log(req.user, admin_id);

    const mailList = await GmailRecords.findMany({
      where: { admin_id: admin_id }
    })
    res.status(200).json({ data: mailList })
  } catch (error) {
    console.log(error);
    res.send(error);
  }
}

export const gmail_service_controller = {
  takeConsent: takeConsent,
  mailList: mailList,
  getMailList: getMailList
}