import accEnablerController from "../service/accEnabler.js";
import express from "express";

const router = express.Router();

router.get("/getEnabler", accEnablerController.getAllUserEnablers);
router.get("/getEnablerById/:id", accEnablerController.getUserEnablersById);
router.get("/getRoles",accEnablerController.getRoles);
router.get("/getUserRole", accEnablerController.getUserRole);
router.post("/postEnabler", accEnablerController.createUserEnabler);
router.put('/putEnabler/:id',accEnablerController.putUserEnablerById);
router.delete('/deleteEnabler/:id',accEnablerController.deleteUserEnabler);

export default router;