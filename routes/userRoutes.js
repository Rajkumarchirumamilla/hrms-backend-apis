const router = require('express').Router();

const user = require('../controllers/userController');
const { auth } = require('../middleware/authmiddleware');
const { allowRoles } = require('../middleware/rolemiddleware');



router.get('/', (req, res) => res.send("test route"));

module.exports = router;