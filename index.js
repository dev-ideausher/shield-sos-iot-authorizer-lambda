const { MongoClient } = require('mongodb');

// MongoDB connection URI (better to store this in AWS Lambda environment variables)
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'shield-database'; // Update with your actual database name
const COLLECTION_NAME = 'Device';  // Update with your actual collection name
console.log(MONGODB_URI)

let client = null;

// Initialize MongoDB client
const initializeDB = async () => {
    if (!client) {
        client = new MongoClient(MONGODB_URI, { useUnifiedTopology: true });
        await client.connect();
        console.log("MongoDB connected successfully.");
    }
};

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;  // Prevent Lambda from waiting for the event loop to finish

    try {
        // Print Event for Testing
        console.log(JSON.stringify(event));

        // Extract username and password from the event
        const username = event.protocolData?.mqtt?.clientId;


        const passwordEncoded = event.protocolData?.mqtt?.password;
        if (!passwordEncoded) {
            console.log("Password not found in the event.");
            return { isAuthenticated: false };
        }
        // Decode the Base64 encoded password
        const passwordDecoded = Buffer.from(passwordEncoded, 'base64').toString('utf-8');


        if (!username || !passwordDecoded) {
            console.log("Username or Password not found in the event.");
            return { isAuthenticated: false };
        }

        console.log(`Username: ${username}, Password: ${passwordDecoded}`);

        // Initialize MongoDB client
        await initializeDB();

        // Access the database and collection
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // Find the device by username
        const device = await collection.findOne({ username });

        if (!device) {
            console.log("Device with the given username not found.");
            return { isAuthenticated: false };
        }

        // Compare the password
        if (device.password !== passwordDecoded) {
            console.log("Password Authentication: Failure");
            return { isAuthenticated: false };
        }

        console.log("Password Authentication: Success");

        // Create Policy to limit access on what topics can be published on
        const policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "iot:Connect"
                    ],
                    "Resource": [
                        "arn:aws:iot:us-east-1:*:client/${iot:ClientId}"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "iot:Publish",
                        "iot:Receive"
                    ],
                    "Resource": [
                        "arn:aws:iot:us-east-1:*:topic/${iot:ClientId}", // Existing rule for topics with ClientId
                        "arn:aws:iot:us-east-1:*:topic/shieldsos/incoming/${iot:ClientId}", // Add rule for shieldsos/incoming
                        "arn:aws:iot:us-east-1:*:topic/shieldsos/outgoing/${iot:ClientId}"  // Add rule for shieldsos/outgoing
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "iot:Subscribe"
                    ],
                    "Resource": [
                        "arn:aws:iot:us-east:*:topicfilter/${iot:ClientId}", // Existing rule for topics with ClientId
                        "arn:aws:iot:us-east:*:topicfilter/shieldsos/incoming/${iot:ClientId}", // Add rule for shieldsos/incoming
                        "arn:aws:iot:us-east:*:topicfilter/shieldsos/outgoing/${iot:ClientId}"  // Add rule for shieldsos/outgoing
                    ]
                }
            ]
        };

        // Construct the response object
        const result = {
            isAuthenticated: true,
            principalId: "EnhancedAuthorizerLambda",
            policyDocuments: [JSON.stringify(policy)],
            disconnectAfterInSeconds: 1800,
            refreshAfterInSeconds: 300
        };

        console.log(result);
        return result;

    } catch (error) {
        console.error("Error during authentication process:", error);
        return { isAuthenticated: false };
    }
};