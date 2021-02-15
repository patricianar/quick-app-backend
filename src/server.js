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
        const user = await db.collection('companies').findOne({ Email: email, Password: password });
        let responseServer = 'no';
        if (user != null) {
            responseServer = 'yes';
        }
        res.status(200).json({ responseServer });
    }, res);
});

app.post('/registration', async(req, res) => {
    const { name, last, company, address, city, province, email, password } = req.body;
    withDB(async (db) => {
        const newUser = await db.collection('companies').insert({ Name: name, Last: last, Company: company, Address: address, City: city, 
        Province: province, Email: email, Password: password });
        //DON'T FORGET TO CREATE COLLECTION FOR EACH COMPANY
        let responseServer = 'User has been created';
        res.status(200).json({responseServer});
    },res);
})

app.listen(8000, () => console.log('Listening on port 8000'));