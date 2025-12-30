import express from 'express';
import tagsearch from '../services/tagsearch.js';
const router = express.Router();


//Tagsearch(Attribute) routes
router.route('/getTags').get(tagsearch.get_tagSearchData);
router.route('/getTags/:id').get(tagsearch.get_tagSearchData_byId);



//Tag value search routes

router.route('/getTagsValues').get(tagsearch.get_tagSearchData_byDateRange);

export default router;