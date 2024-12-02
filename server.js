require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// Twilio client setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Nodemailer transporter setup with updated security options
const transporter = nodemailer.createTransport({
  service: 'gmail', // You can use any email service provider
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app-specific password
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates
  },
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

// Create User Schema and Model based on your MongoDB collection structure
const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  whatsappNumber: { type: String, required: true },
  dob: { type: Date, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);

// Helper function to format phone numbers
const formatPhoneNumber = (number) => {
  if (!number) return null; // Return null if the number is empty
  // Check if the number starts with '0', if so replace it with '+94'
  if (number.startsWith('0')) {
    return `+94${number.slice(1)}`;
  }
  return number; // Return as-is if already in correct format
};

app.get('/', (req, res) => {
  res.send("Welcome to Express server");
});

// Route to send SMS to all users
app.post('/sendSmsToAll', async (req, res) => {
  const { message } = req.body; // Get message from request body

  // Validate message content
  if (!message) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    // Fetch all users from MongoDB
    const users = await User.find({});
    const phoneNumbers = users.map((user) => formatPhoneNumber(user.whatsappNumber)).filter(Boolean); // Format numbers and remove nulls

    console.log('Fetched phone numbers:', phoneNumbers);

    // Send SMS to each user using Twilio
    const sendSmsPromises = phoneNumbers.map((number) => {
      console.log('Attempting to send SMS to:', number); // Log the number being sent to
      return client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: number,
      })
      .then((message) => {
        console.log(`Message sent to ${number}:`, message.sid);
        return message;
      })
      .catch(err => {
        console.error(`Failed to send message to ${number}:`, err.message); // Log the error message
        return null; // Ignore the error for this number
      });
    });

    await Promise.all(sendSmsPromises);
    res.status(200).json({ message: 'Messages sent successfully' });
  } catch (err) {
    console.error('Error sending SMS:', err.message);
    res.status(500).json({ error: 'Failed to send messages', details: err.message });
  }
});

// Route to send Email to all users
app.post('/sendEmailToAll', async (req, res) => {
  const { subject, text } = req.body; // Get subject and message content from request body

  // Validate subject and message content
  if (!subject || !text) {
    return res.status(400).json({ error: 'Subject and message content are required' });
  }

  try {
    // Fetch all users from MongoDB
    const users = await User.find({});
    const emailAddresses = users.map((user) => user.email).filter(Boolean); // Extract emails and filter out empty values

    console.log('Fetched email addresses:', emailAddresses);

    // Send email to each user using Nodemailer
    const sendEmailPromises = emailAddresses.map((email) => {
      return transporter.sendMail({
        from: process.env.EMAIL_USER, // Sender's email address
        to: email, // Recipient's email address
        subject, // Subject of the email
        text, // Email content
      })
      .then(info => {
        console.log(`Email sent to ${email}:`, info.response);
        return info;
      })
      .catch(err => {
        console.error(`Failed to send email to ${email}:`, err.message);
        return null; // Ignore the error for this email
      });
    });

    await Promise.all(sendEmailPromises);
    res.status(200).json({ message: 'Emails sent successfully' });
  } catch (err) {
    console.error('Error sending emails:', err.message);
    res.status(500).json({ error: 'Failed to send emails', details: err.message });
  }
});

// Handle favicon requests
app.get('/favicon.ico', (req, res) => res.status(204));

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
