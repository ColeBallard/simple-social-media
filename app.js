require('dotenv').config();

const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const Sequelize = require('sequelize');

// Initialize Express app
const app = express();

// Set the view engine to ejs
app.set('view engine', 'ejs');

// Middleware that parses requests with json
app.use(bodyParser.json());

// Serve static files from the public directory
app.use(express.static('public'));

// Session setup
app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true
}));

// Set up Sequelize
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: 'localhost',
    dialect: 'mysql'
});

// Define the User model
const User = sequelize.define('user', {
    username: {
        type: Sequelize.STRING,
        unique: true,
        primaryKey: true
    },
    password: Sequelize.STRING,
    bio: Sequelize.TEXT
}, {
    timestamps: false
});

// Define Feed model
const Feed = sequelize.define('feed', {
    username: {
        type: Sequelize.STRING,
        references: {
            model: User,
            key: 'username'
        }
    },
    datetime: Sequelize.DATE,
    message: Sequelize.TEXT
}, {
    tableName: 'feed',
    timestamps: false
});

// Associations (primary and foreign key connections)
User.hasMany(Feed, { foreignKey: 'username' });
Feed.belongsTo(User, { foreignKey: 'username' });

// Sync the models with the database
sequelize.sync({ alter: true });

// Routes
// Profile page
app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/profile.html');
});

// Sign Up Route
app.post('/signup', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        await User.create({
            username: req.body.username,
            password: hashedPassword,
            bio: ''
        });

        req.session.username = req.body.username; // Store username in session
        res.status(201).json({ message: 'User created', username: req.body.username }); // Send a JSON response
    } catch (error) {
        res.status(500).json({ error: error.message }); // Send error details in JSON format
    }
});

// Sign In Route
app.post('/signin', async (req, res) => {
    const user = await User.findOne({ where: { username: req.body.username } });
    if (user) {
        const match = await bcrypt.compare(req.body.password, user.password);
        if (match) {
            req.session.username = user.username; // Store username in session
            res.status(200).json({ message: 'Logged in successfully' });
        } else {
            res.status(400).send({ message: 'Incorrect password' });
        }
    } else {
        res.status(404).send({ message: 'User not found' });
    }
});

// Sign Out Route
app.post('/signout', (req, res) => {
    // Destroy the session
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error signing out');
        }
        res.send('Signed out successfully');
    });
});

// Route to fetch user profile
app.get('/api/userProfile', async (req, res) => {
    // Check if the user is authenticated
    if (!req.session.username) {
        return res.status(401).send('User not authenticated');
    }

    try {
        // Find the user in the database using the username stored in the session
        const user = await User.findOne({ where: { username: req.session.username } });
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Respond with the user's profile information
        res.json({
            username: user.username,
            bio: user.bio
        });
    } catch (error) {
        // Handle any potential errors
        res.status(500).send('Server error: ' + error.message);
    }
});

// Check if user is signed in
app.get('/api/checkSession', (req, res) => {
    if (req.session.username) {
        res.json({ isAuthenticated: true });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// Update Bio Route
app.post('/updateBio', async (req, res) => {
    if (req.session.username) {
        try {
            const user = await User.findByPk(req.session.username);
            user.bio = req.body.bio;
            await user.save();
            res.status(200).send({ message: 'Bio updated' });
        } catch (error) {
            res.status(500).send({ message: "Error updating bio" });
        }
    } else {
        res.status(401).send({ message: 'Not authenticated' });
    }
});

// API route for fetching feed data
app.get('/api/feeds', (req, res) => {
    Feed.findAll({
        include: [{
            model: User,
            attributes: ['username']
        }]
    }).then(feeds => {
        res.json(feeds);
    }).catch(err => {
        res.status(500).send("Error retrieving feeds");
    });
});

// Route for posting to feed
app.post('/api/feeds', async (req, res) => {
    // Check if the user is authenticated
    if (!req.session.username) {
        return res.status(401).send('User not authenticated');
    }

    try {
        const user = await User.findByPk(req.session.username); // Retrieve the username from the User model using the session username
        if (!user) {
            return res.status(404).send('User not found');
        }

        const { message } = req.body; // Extract message from the request body

        // Create a new Feed entry
        const feed = await Feed.create({
            username: user.username, // Use the username from the authenticated user
            message: message,
            datetime: new Date() // Capture the current date and time
        });

        res.status(201).json(feed);
    } catch (error) {
        res.status(500).send("Error posting feed: " + error.message);
    }
});

// Route for viewing another persons profile
app.get('/profile/:username', async (req, res) => {
    const username = req.params.username;

    try {
        const user = await User.findOne({
            where: { username: username }
        });

        if (user) {
            // Populate the template with the user's profile information and render it
            res.render('userProfile', {
                username: user.username,
                bio: user.bio
            });
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).send('Server error');
    }
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on 127.0.0.1:${PORT}.`);
});
