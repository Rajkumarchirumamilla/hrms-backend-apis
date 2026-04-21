require("dotenv").config();
const axios = require("axios");

// ✅ Message Templates
const getMessage = (type, params) => {
  switch (type) {
    case "forgot-password":
      return `Dear user, Your OTP for password reset is ${params.otp}. Use this code to complete the process. For any queries, please visit ping.smaro.app or call us at +91 9052990009.`;

    case "login":
      return `Login successful. Welcome back!`;

    default:
      return "";
  }
};

// ✅ Send SMS
const sendSms = async (mobile, type, params) => {
  try {
    const message = getMessage(type, params);

    if (!message) return false;

    const formattedMobile = `+91${mobile}`;

    const SMS_URL = `${process.env.SMS_SERVER_URL}/v3/api.php?username=${process.env.SMS_USERNAME}&apikey=${process.env.SMS_API_KEY}&senderid=${process.env.SMS_SENDER_ID}&mobile=${formattedMobile}&message=${(message)}`;

    const response = await axios.get(SMS_URL);
    console.log('response',response)
    return response.data;
  } catch (e) {
    console.error("SMS error:", e);
    return false;
  }
};

module.exports = { sendSms };