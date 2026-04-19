const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../config/s3");

const uploadToS3 = async (file) => {
  try {
    const fileName = Date.now() + "-" + file.originalname;

    const params = {
      Bucket: process.env.AWS_BUCKET,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype
    };

    await s3.send(new PutObjectCommand(params));

    return `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw error;
  }
};

module.exports = uploadToS3;