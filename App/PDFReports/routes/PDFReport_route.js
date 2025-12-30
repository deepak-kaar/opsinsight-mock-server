import express from 'express';
// import pdfReport from '../../services/PDFReports/PDFReport/PDF.js';
import pdfReport from '../services/PDF.js';
const router = express.Router();
    
router.route('/generatePDFFromHtml').post(pdfReport.generate_pdfReport);

export default router;
// export default router;