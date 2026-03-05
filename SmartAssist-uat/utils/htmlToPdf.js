const html_to_pdf = require("html-pdf-node");
const AWS = require("aws-sdk");

let options = {
  format: "A4",
  printBackground: true,
  waitForNetworkIdle: true,
};

async function generatePDF(response, signatureImage) {
  try {
    const res = await fetch(
      "https://smartassist-media.s3.ap-south-1.amazonaws.com/salesorder.html"
    );

    if (!res.ok) {
      throw new Error("Failed to fetch HTML. Status: " + res.status);
    }

    let htmlContent = await res.text();
    htmlContent = htmlContent.trim();

    htmlContent = htmlContent.replace(
      /(<(div|p|section)[^>]*>\s*<\/\2>)+$/gi,
      ""
    );

    // htmlContent = htmlContent.replace(
    //   /<%=\s*data\.(.*?)\s*%>/g,
    //   (match, fieldName) => {
    //     if (fieldName === "buyer_signature") {
    //       return `<img src='${signatureImage}' alt="Buyer Signature" style="width:40px; height: 40px">`;
    //     } else {
    //       return response[fieldName] ?? "";
    //     }
    //   }
    // );

    htmlContent = htmlContent.replace(
      /<%=\s*data\.(.*?)\s*%>/g,
      (match, fieldName) => {
        if (fieldName === "buyer_signature") {
          if (signatureImage) {
            return `<img src="${signatureImage}" alt="Buyer Signature" style="width:120px; height:40px;">`;
          }

          return `<div style="width:120px; height:40px; border-bottom:1px solid #000;"></div>`;
        }

        return response[fieldName] ?? "";
      }
    );

    const file = { content: htmlContent };

    const pdfBuffer = await html_to_pdf.generatePdf(file, options);
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: process.env.AWS_REGION,
    });

    const folderName = "sales-order";

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${folderName}/${response.order_id}.pdf`,
      Body: pdfBuffer,
      ContentType: "application/pdf",
      ACL: "public-read",
    };

    const upload = await s3.upload(params).promise();
    const filename = upload.Location;

    console.log(
      "PDF uploaded successfully:",
      `${folderName}/${response.order_id}.pdf`
    );
    return filename;
  } catch (err) {
    console.error("Error generating PDF:", err);
  }
}

module.exports = { generatePDF };
