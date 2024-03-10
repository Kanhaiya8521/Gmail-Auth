import { Request, Response } from "express";
import { takeConsentService } from "../services/gmail_service.service";

export const takeConsent = async (req: Request, res: Response) => {
  try {
    const userId = "12345";
    const email = "kanhatokanhaiya@gmail.com";
    const getConsent = await takeConsentService.takeConsent(userId, email);
    res.status(200).json({status: true, message: getConsent})
  } catch (error: any) {
    console.error(error.message);
    res.status(500).json({
      success: true,
      message: error.message,
    });
  }
};
