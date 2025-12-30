import express from 'express';
import pi_send from '../services/pi_send.js';
import pi_receive from '../services/pi_receive.js';
const router = express.Router();


// PI Send
router.route('/postPiSend').post(pi_send.post_pi_send);
router.route('/getPiSend').post(pi_send.get_pi_send);
router.route('/getPiSend/:id').get(pi_send.get_pi_send_byId);
router.route('/updatePiSend/:id').post(pi_send.update_pi_send);
router.route('/deletePiSend/:id').delete(pi_send.delete_pi_send);

// PI Receive
router.route('/postPiReceive').post(pi_receive.post_pi_receive);
router.route('/getPiReceive').post(pi_receive.get_pi_receive);
router.route('/getPiReceive/:id').get(pi_receive.get_pi_receive_byId);
router.route('/updatePiReceive/:id').post(pi_receive.update_pi_receive);
router.route('/deletePiReceive/:id').delete(pi_receive.delete_pi_receive);

export default router;