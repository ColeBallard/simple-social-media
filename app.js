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

app.use(bodyParser.json());

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


// Associations
User.hasMany(Feed, { foreignKey: 'username' });
Feed.belongsTo(User, { foreignKey: 'username' });

// Session setup
app.use(session({
    secret: process.env.SECRET_KEY, // replace with a real secret key
    resave: false,
    saveUninitialized: true
}));

app.use(express.static('public'));

// Sync the models with the database
sequelize.sync({ alter: true });

// Routes

app.get('/profile', (req, res) => {
    res.sendFile(__dirname + '/public/profile.html');
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
            // Add other fields you want to include in the user profile response
        });
    } catch (error) {
        // Handle any potential errors
        res.status(500).send('Server error: ' + error.message);
    }
});

app.get('/api/checkSession', (req, res) => {
    if (req.session.username) {
        res.json({ isAuthenticated: true });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// Sign Up Route
app.post('/signup', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = await User.create({
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

app.post('/api/feeds', async (req, res) => {
    // Check if the user is authenticated
    if (!req.session.username) {
        return res.status(401).send('User not authenticated');
    }

    try {
        // Retrieve the username from the User model using the session username
        const user = await User.findByPk(req.session.username);
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Extract message from the request body
        const { message } = req.body;

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

app.get('/profile/:username', async (req, res) => {
    const username = req.params.username;

    try {
        const user = await User.findOne({
            where: { username: username }
        });

        if (user) {
            // Send the user's profile information
            // You might render an HTML page here or send JSON data
            res.render('userProfile', { // Assuming you're using a template engine like EJS
                username: user.username,
                bio: user.bio
            });
        } else {
            // User not found
            res.status(404).send('User not found');
        }
    } catch (error) {
        // Handle errors
        console.error('Error fetching user profile:', error);
        res.status(500).send('Server error');
    }
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
});
