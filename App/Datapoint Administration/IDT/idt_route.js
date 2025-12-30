import express from 'express';
import jsons from './idt.js';
import mapping from './eventMapping.js';
const router = express.Router();

router.route('/postIdt').post(jsons.post_Idt);
router.route('/updateIdt').post(jsons.update_Idt);
router.route('/updateIdtRoles').post(jsons.update_idt_roles);
router.route('/getIdtList').post(jsons.get_idt_list)
router.route('/getIdtVersions').post(jsons.get_Idt_versions);
router.route('/getIdt/:id').get(jsons.get_Idt_ID);
router.route('/idt_odt_mapping/:id').get(jsons.get_Idt_Odt_Mapping);
router.route('/updateIdt').post(jsons.update_Idt);
router.route('/deleteIdt/:id').get(jsons.delete_idt);

// templates section added by rangarao
router.route('/getTemplate/:id').get(jsons.get_template);
router.route('/postTemplate').post(jsons.post_template);
router.route('/getTemplates').post(jsons.getTemplates); // get all templates
router.route('/updateTemplate/:id').post(jsons.update_template);
router.route('/deleteTemplate/:id').get(jsons.delete_template);
router.route('/createTemplateMapping').post(jsons.create_template_mapping); // create template mapping
router.route('/getTemplateMapping').post(jsons.get_template_mapping).post(jsons.get_template_mapping);
router.route('/getTemplateMappings').post(jsons.get_template_mappings); // get all template mappings
router.route('/updateTemplateMapping/:id').post(jsons.update_template_mapping); // update template mapping
router.route('/deleteTemplateMapping/:id').get(jsons.delete_template_mapping); // delete template mapping
router.route('/saveTemplateMappingValues').post(jsons.save_template_mapping_values); // save template mapping widget values           

router.route('/odtMapping').post(mapping.odt_mapping);
router.route('/getOdt/:id').get(mapping.get_odt);
router.route('/valueMapping').get(mapping.value_odt_mapping);
router.route('/pageMapping').post(mapping.page_odt_mapping);
router.route('/deleteOdt/:id').get(mapping.delete_odt);



// entityForm
router.route('/entityForm').post(mapping.entity_form_mapping);

// Report
router.route('/reportForm').post(mapping.report_form_mapping);
router.route('/getAttributesById/:id').get(mapping.get_page_attributes)

router.route('/valueMappingById').post(mapping.value_odt_mapping_Id);
router.route('/updateEmitterId').post(mapping.update_odt_emitterId);
router.route('/entityMapping').post(mapping.entity_mapping);

// Test Route added by rangarao for test
router.route('/getCards').get(mapping.get_cards)


export default router;