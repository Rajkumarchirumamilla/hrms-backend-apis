const sms = require("./sms");

const Joi = require("joi");

// ✅ Email validation schema
const emailSchema = Joi.string().email({ tlds: { allow: false } });

const sendMessage = async (entity, type, params) => {
  try {
    const { email, mobile } = entity;

    // ✅ Send SMS
    if (mobile) {
      return await sms.sendSms(mobile, type, params);
    }

    // ✅ Send Email
    // if (email) {
    //   const { error } = emailSchema.validate(email);

    //   if (error) {
    //     return false;
    //   }

    //   return await sendMail(email, type, params);
    // }

    return false;
  } catch (e) {
    console.error("sendMessage error:", e);
    return false;
  }
};

module.exports = { sendMessage };