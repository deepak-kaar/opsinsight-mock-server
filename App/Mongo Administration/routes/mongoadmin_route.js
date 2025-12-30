import express from "express";
import controller from "../services/mongoadmin.js";

const router = express.Router();

router.get("/collections", controller.get_collections);
router.post("/:collection/find", controller.get_documents);
router.put("/:collection/replace/:id", controller.replace_document);
router.delete("/:collection/hardDelete/:id", controller.hard_delete_document);
router.post("/:collection/create", controller.create_document);
router.put("/:collection/update/:id", controller.update_document);
router.delete("/:collection/delete/:id", controller.delete_document);
router.post("/:collection/aggregate", controller.run_aggregate);
router.get("/category/:category",controller.getCategory);
router.get("/logger/summary",controller.getSummary) 

// ✅ New route
router.get("/:collection/getSchema", controller.create_document_mapping);

export default router;