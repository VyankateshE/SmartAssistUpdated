const AWS = require("aws-sdk");
const responses = require("./globalResponse");
const logger = require("../middlewares/fileLogs/logger");
const Events = require("../models/transactions/eventModel");
const Users = require("../models/master/usersModel");
const Colors = require("../models/master/colorModel");
const moment = require("moment-timezone");

const now = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

//save the license of customer in S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

//upload license
const uploadLicense = async (req, res) => {
  try {
    if (!req.file) {
      return responses.notFound(res, `No file found`);
    }

    const fileName = `licenses/${now}_${req.params.eventId}`;

    // Upload to S3
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read",
    };

    const uploadResult = await s3.upload(params).promise();

    responses.success(res, `File uploaded successfully`, uploadResult.Location);
    (async () => {
      try {
        await Events.update(
          { license_img: uploadResult.Location },
          { where: { event_id: req.params.eventId } }
        );
      } catch (err) {
        logger.error(`Failed to update image URL in DB: ${err.message}`);
      }
    })();
  } catch (error) {
    console.error("Error uploading file:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//upload license
const uploadMap = async (req, res) => {
  try {
    if (!req.file) {
      return responses.notFound(res, `No file found`);
    }

    const fileName = `maps/${now}_${req.params.eventId}`;

    // Upload to S3
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read",
    };

    const uploadResult = await s3.upload(params).promise();

    responses.success(res, `File uploaded successfully`, uploadResult.Location);

    (async () => {
      try {
        await Events.update(
          { map_img: uploadResult.Location },
          { where: { event_id: req.params.eventId } }
        );
      } catch (err) {
        logger.error(`Failed to update image URL in DB: ${err.message}`);
      }
    })();
  } catch (error) {
    console.error("Error uploading file:", error);
    return responses.serverError(res, error.message);
  }
};

//upload profile pic
const uploadProfilePic = async (req, res) => {
  try {
    const { phone } = req.body;

    if (phone && !/^\d{10}$/.test(phone)) {
      return responses.badRequest(res, `Invalid mobile number format`);
    }

    let profilePicUrl = null;
    if (req.file) {
      try {
        const fileName = `profiles/${Date.now()}_${req.userId}`;

        // Upload to S3
        const params = {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
          ACL: "public-read",
        };

        const uploadResult = await s3.upload(params).promise();
        profilePicUrl = uploadResult.Location;
      } catch (fileError) {
        console.error("Error uploading file to S3:", fileError);
        return responses.serverError(
          res,
          `File upload failed: ${fileError.message}`
        );
      }
    }

    if (phone || profilePicUrl) {
      try {
        const updateData = {};
        if (profilePicUrl) updateData.profile_pic = profilePicUrl;
        if (phone) updateData.phone = phone;

        await Users.update(updateData, { where: { user_id: req.userId } });

        return responses.success(res, `User data updated successfully`, {
          profilePic: profilePicUrl,
          phone: phone,
        });
      } catch (dbError) {
        console.error("Error updating database:", dbError);
        return responses.serverError(
          res,
          `Database update failed: ${dbError.message}`
        );
      }
    }
    return responses.badRequest(res, `No file or mobile number provided`);
  } catch (error) {
    console.error("Unexpected error:", error);
    return responses.serverError(res, `Unexpected error: ${error.message}`);
  }
};
//end

const uploadColors = async (req, res) => {
  try {
    if (!req.file) {
      return responses.notFound(res, `No file found`);
    }

    const fileName = `colors/${Date.now()}_${req.file.originalname}`;

    // Upload to S3
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read",
    };

    const uploadResult = await s3.upload(params).promise();
    responses.success(res, `File uploaded successfully`, uploadResult.Location);

    (async () => {
      try {
        const cleanName = decodeURIComponent(
          `${req.file.originalname}`.replace(/\.[^/.]+$/, "")
        );
        await Colors.update(
          { image_url: uploadResult.Location },
          { where: { color_name: cleanName } }
        );
      } catch (err) {
        logger.error(`Failed to update image URL in DB: ${err.message}`);
      }
    })();
  } catch (error) {
    console.error("Error uploading file:", error);
    return responses.serverError(res, error.message);
  }
};
//end

//upload bug media pic
const bugMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return responses.notFound(res, `No files found`);
    }
    const uploadPromises = req.files.map(async (file) => {
      const fileName = `bugs/${Date.now()}_${req.userId}_${file.originalname}`;

      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
      };

      const uploadResult = await s3.upload(params).promise();
      return uploadResult.Location;
    });

    const uploadedUrls = await Promise.all(uploadPromises);

    responses.success(res, `Files uploaded successfully`, uploadedUrls);
  } catch (error) {
    console.error("Error uploading file:", error);
    return responses.serverError(res, error.message);
  }
};
//end

module.exports = {
  uploadLicense,
  uploadMap,
  uploadProfilePic,
  uploadColors,
  bugMedia,
};
