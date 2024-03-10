import express,{ Express } from "express";
const router = express.Router();
import {takeConsent} from "./../controllers/gmail_service.controller";


router.get("/gmail", takeConsent);

export default router;