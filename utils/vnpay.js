var crypto = require("crypto");
var querystring = require("querystring");
var dayjs = require("dayjs");

function sortObject(obj) {
  var sorted = {};
  Object.keys(obj)
    .sort()
    .forEach(function (key) {
      sorted[key] = obj[key];
    });
  return sorted;
}

function buildPaymentUrl(opts) {
  var amount = Number(opts.amount);
  var orderId = opts.orderId;
  var ipAddr = opts.ipAddr || "0.0.0.0";
  var vnpUrl =
    process.env.VNPAY_VNP_URL ||
    "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
  var returnUrl =
    process.env.VNPAY_RETURN_URL ||
    "http://localhost:3000/api/payments/vnpay/return";
  var tmnCode = process.env.VNPAY_TMN_CODE || "";
  var secretKey = process.env.VNPAY_HASH_SECRET || "";

  var createDate = dayjs().format("YYYYMMDDHHmmss");
  var vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: opts.orderInfo || "Premium subscription " + orderId,
    vnp_OrderType: "other",
    vnp_Amount: Math.round(amount * 100),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  vnpParams = sortObject(vnpParams);
  var signData = querystring.stringify(vnpParams, { encode: false });
  var hmac = crypto.createHmac("sha512", secretKey);
  var signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  vnpParams.vnp_SecureHash = signed;
  return vnpUrl + "?" + querystring.stringify(vnpParams, { encode: true });
}

function verifyReturn(query) {
  var secretKey = process.env.VNPAY_HASH_SECRET || "";
  var receivedHash = query.vnp_SecureHash;
  var clone = Object.assign({}, query);
  delete clone.vnp_SecureHash;
  delete clone.vnp_SecureHashType;
  clone = sortObject(clone);
  var signData = querystring.stringify(clone, { encode: false });
  var hmac = crypto.createHmac("sha512", secretKey);
  var signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  return signed === receivedHash;
}

module.exports = {
  buildPaymentUrl: buildPaymentUrl,
  verifyReturn: verifyReturn,
};
