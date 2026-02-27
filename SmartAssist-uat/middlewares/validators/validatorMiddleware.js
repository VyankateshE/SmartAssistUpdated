const validateInput = (values) => {
  values.forEach((value) => {
    // Check if the value is empty or contains only spaces
    if (!value) {
      return true;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      throw new Error("This field cannot contain only spaces");
    }

    // Validate that the value contains only alphanumeric characters and one space between words
    const regex = /^[a-zA-Z0-9@_-]+( [a-zA-Z0-9@_-]+)*$/;
    if (typeof value === "string" && !regex.test(value)) {
      throw new Error("Only alphanumeric characters are allowed");
    }
  });

  return true;
};

const validateEmail = (value) => {
  // Check if the value is empty or contains only spaces
  if (!value) {
    return true;
  }
  if (value.trim().length === 0) {
    throw new Error("This field cannot contain only spaces");
  }

  const regex = /^(?=.*@)(?=.*\.)[a-z0-9@.]+$/;
  if (!regex.test(value)) {
    throw new Error("Not a valid email");
  }

  return true;
};

const validateInt = (values) => {
  values.forEach((value) => {
    if (!value) {
      return true;
    }
    const stringVal = String(value);
    // Check if the value is empty or contains only spaces
    if (stringVal.trim().length === 0) {
      throw new Error("This field cannot contain only spaces");
    }

    // Validate that the value is only numbers
    const regex = /^\d+$/;
    if (!regex.test(value)) {
      throw new Error("Only numbers are allowed");
    }
  });

  return true;
};

const validatePhoneNumber = (values) => {
  values.forEach((value) => {
    if (!value) {
      return true;
    }
    const stringVal = String(value);
    // Check if the value is empty or contains only spaces
    if (stringVal.trim().length === 0) {
      throw new Error("This field cannot contain only spaces");
    }

    // Validate that the value is a valid phone number
    const regex = /^(?:\+91)?[6789]\d{9}$/;
    if (!regex.test(value)) {
      throw new Error("Not a valid phone number");
    }
  });

  return true;
};
const validatePwd = (pwd) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
  if (!regex.test(pwd)) {
    throw new Error(
      "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one digit, and one special character (!@#$%^&*)."
    );
  }
  return true;
};

module.exports = {
  validateInput,
  validateEmail,
  validateInt,
  validatePhoneNumber,
  validatePwd,
};
