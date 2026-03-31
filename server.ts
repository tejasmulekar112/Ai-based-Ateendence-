import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email Transporter (Lazy Initialization)
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
    if (EMAIL_HOST && EMAIL_USER && EMAIL_PASS) {
      transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: parseInt(EMAIL_PORT || "587"),
        secure: false, // true for 465, false for other ports
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS,
        },
      });
    }
  }
  return transporter;
}

async function sendEmail(to: string, subject: string, html: string) {
  const mailTransporter = getTransporter();
  if (!mailTransporter) {
    console.warn("Email transporter not configured. Skipping email notification.");
    return;
  }

  try {
    const info = await mailTransporter.sendMail({
      from: process.env.EMAIL_FROM || '"FaceTrack AI" <noreply@facetrack.ai>',
      to,
      subject,
      html,
    });
    console.log("Email sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // In-memory state (for demo purposes, normally you'd use a database)
  let users: any[] = [];
  let attendance: any[] = [];

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Send initial state
    socket.emit("initial_state", { users, attendance });

    socket.on("register_user", async (user) => {
      users.push(user);
      io.emit("user_registered", user);

      // Email Notification: New User Registered
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail(
          adminEmail,
          "New User Registered - FaceTrack AI",
          `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #f97316;">New User Registration</h2>
            <p>A new user has been registered in the system:</p>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Name:</strong> ${user.name}</li>
              <li><strong>ID:</strong> ${user.id}</li>
              <li><strong>Registered At:</strong> ${new Date(user.createdAt).toLocaleString()}</li>
            </ul>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #666;">This is an automated notification from FaceTrack AI.</p>
          </div>
          `
        );
      }
    });

    socket.on("add_attendance", (record) => {
      attendance.unshift(record);
      io.emit("attendance_added", record);
    });

    socket.on("mark_absents", async (records) => {
      attendance = [...records, ...attendance];
      io.emit("absents_marked", records);

      // Email Notification: Bulk Absences Marked
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail && records.length > 0) {
        await sendEmail(
          adminEmail,
          `Alert: ${records.length} Absences Recorded - FaceTrack AI`,
          `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #ef4444;">Absence Alert</h2>
            <p>A total of <strong>${records.length}</strong> users have been marked as absent for today (${new Date().toLocaleDateString()}):</p>
            <ul style="list-style: none; padding: 0;">
              ${records.map((r: any) => `<li>- ${r.userName}</li>`).join('')}
            </ul>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #666;">This is an automated notification from FaceTrack AI.</p>
          </div>
          `
        );
      }
    });

    socket.on("mark_absent", async (record) => {
      attendance.unshift(record);
      io.emit("attendance_added", record);

      // Email Notification: Individual Absence
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail(
          adminEmail,
          `Absence Recorded: ${record.userName} - FaceTrack AI`,
          `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #ef4444;">Individual Absence Recorded</h2>
            <p>User <strong>${record.userName}</strong> has been manually marked as absent for today.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #666;">This is an automated notification from FaceTrack AI.</p>
          </div>
          `
        );
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
