import express from 'express';
import bodyParser, { json } from 'body-parser';
import { MongoClient } from 'mongodb';

const app = express();
app.use(bodyParser.json());

const withDB = async (operations, res) => {
    try {
        const client = await MongoClient.connect('mongodb://localhost:27017', { useNewUrlParser: true });
        const db = client.db('quickInv');
        await operations(db);
        client.close();
    } catch (error) {
        res.status(500).json({ message: 'Error connecting to db', error });
    }
}

app.get('/helloFromByron', (req, res) => res.send('hello From Byron'));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    withDB(async (db) => {
        const user = await db.collection('companies').findOne({ email: email, password: password });
        let responseServer = 'no';
        if (user != null) {
            responseServer = 'yes';
        }
        res.status(200).json({ responseServer });
    }, res);
});

app.listen(8000, () => console.log('Listening on port 8000'));