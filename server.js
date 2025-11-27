"use strict";

const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");

require("dotenv").config();

// ----- PORT -----
const portNumber = process.env.PORT || 3000;

// ----- MONGO CONNECTION STRING -----
const uri = process.env.MONGO_CONNECTION_STRING;
if (!uri) {
    console.error("Error: MONGO_CONNECTION_STRING is not defined in .env");
    process.exit(1);
}

// ----- MONGOOSE SETUP -----
mongoose.connect(uri)
    .then(() => {
        console.log("Connected to MongoDB via Mongoose");
    })
    .catch((err) => {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    });

// ----- MONGOOSE MODELS -----
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
});

const imageSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    imageUrl: { type: String, required: true },
    savedAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Image = mongoose.model("Image", imageSchema);

// ----- EXPRESS APP SETUP -----
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
    session({
        secret: process.env.SESSION_SECRET || "superSecret",
        resave: false,
        saveUninitialized: false,
    })
);

// Make user available to views
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// ----- ROUTE -----
const router = express.Router();

router.get("/", (req, res) => {
    res.redirect("/login");
});

// ----- LOGIN ROUTES -----

// GET /login - show login form
router.get("/login", (req, res) => {
    res.render("login", { error: null });
});

// POST /login - simple username login
router.post("/login", async (req, res) => {
    const username = (req.body.username || "").trim();

    if (!username) {
        return res.render("login", { error: "Username is required." });
    }

    try {
        let user = await User.findOne({ username });
        if (!user) {
            user = await User.create({ username });
        }

        req.session.user = {
            id: user._id.toString(),
            username: user.username,
        };

        res.redirect("/home");
    } catch (err) {
        console.error("Error in /login:", err);
        res.render("login", { error: "Something went wrong. Try again." });
    }
});

// POST /logout - destroy session
router.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// ----- MAIN APP ROUTES -----

// Require login
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

// GET /home - main page with buttons
router.get("/home", requireLogin, (req, res) => {
    const currentImage = req.session.currentImage || null;
    res.render("home", {
        currentImage,
    });
});

// GET /random - call Dog API using fetch
router.get("/random", requireLogin, async (req, res) => {
    try {
        const response = await fetch("https://dog.ceo/api/breeds/image/random");
        if (!response.ok) {
            throw new Error("Dog API returned non-OK status");
        }
        
        const data = await response.json();
        const imageUrl = data.message;
        
        // store current image in session
        req.session.currentImage = imageUrl;

        res.render("home", {
            currentImage: imageUrl,
        });
    } catch (err) {
        console.error("Error fetching random image:", err);
        res.render("home", {
            currentImage: null,
            error: "Could not load image. Please try again.",
        });
    }
});

// POST /save - save current image for logged-in user
router.post("/save", requireLogin, async (req, res) => {
    const imageUrl = req.body.imageUrl || req.session.currentImage;

    if (!imageUrl) {
        return res.redirect("/home");
    }

    try {
        await Image.create({
            user: req.session.user.id,
            imageUrl,
        });

        res.redirect("/saved");
    } catch (err) {
        console.error("Error saving image:", err);
        res.redirect("/home");
    }
});

// GET /saved - show saved images + timestamps
router.get("/saved", requireLogin, async (req, res) => {
    try {
        const images = await Image.find({ user: req.session.user.id }).sort({
            savedAt: -1,
        });

        res.render("saved", { images });
    } catch (err) {
        console.error("Error loading saved images:", err);
        res.render("saved", { images: [] });
    }
});

// attach router
app.use("/", router);

// ----- START SERVER + CLI "STOP" -----
const server = app.listen(portNumber, () => {
    console.log(`Web server started and running at http://localhost:${portNumber}`);
    openCli();
});

function openCli() {
    const readline = require("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt("Stop to shutdown the server: ");
    rl.prompt();

    rl.on("line", (line) => {
        const cmd = String(line || "").trim().toLowerCase();

        if (cmd === "stop") {
            console.log("Shutting down the server");
            rl.close();
            server.close(() => {
                mongoose.connection.close(false, () => {
                    process.exit(0);
                });
            });
        } else if (cmd.length > 0) {
            console.log(`Invalid command: ${cmd}`);
            rl.prompt();
        } else {
            rl.prompt();
        }
    });
}