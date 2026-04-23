const express = require("express");
const router = express.Router();

const {
  addDesignation,
  getDesignations,
  updateDesignation,
  deleteDesignation
} = require("../controllers/designationController");

router.post("/add-designation", addDesignation);
router.get("/designations", getDesignations);
router.put("/update-designation", updateDesignation);
router.delete("/delete-designation", deleteDesignation);

module.exports = router;