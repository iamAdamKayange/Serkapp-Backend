const Joi = require('joi');

// Password complexity validation
const passwordComplexity = (value, helpers) => {
  if (value.length < 8) {
    return helpers.error('any.custom', { message: 'Password must be at least 8 characters long' });
  }
  if (!/[A-Z]/.test(value)) {
    return helpers.error('any.custom', { message: 'Password must contain at least one uppercase letter' });
  }
  if (!/[a-z]/.test(value)) {
    return helpers.error('any.custom', { message: 'Password must contain at least one lowercase letter' });
  }
  if (!/[0-9]/.test(value)) {
    return helpers.error('any.custom', { message: 'Password must contain at least one number' });
  }
  return value;
};

const validateRegister = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().custom(passwordComplexity).required(),
    firstName: Joi.string().min(2).max(50).trim().required(),
    lastName: Joi.string().min(2).max(50).trim().optional(),
    phone: Joi.string().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/).optional(),
    role: Joi.string().valid('normal', 'landlord').default('normal'),
  });
  const { value, error } = schema.validate(req.body, { 
    stripUnknown: true,
    abortEarly: false 
  });
  if (error) {
    const errors = error.details.map(detail => detail.message);
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors 
    });
  }
  req.body = value;
  next();
};

const validateLogin = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().required(),
  });
  const { value, error } = schema.validate(req.body, { 
    stripUnknown: true,
    abortEarly: false 
  });
  if (error) {
    const errors = error.details.map(detail => detail.message);
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors 
    });
  }
  req.body = value;
  next();
};

module.exports = { validateRegister, validateLogin };
