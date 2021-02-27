import express from 'express';
import bodyParser, { json } from 'body-parser';
import { MongoClient, ObjectID } from 'mongodb';

const app = express();
app.use(bodyParser.json());

const withDB = async (operations, res) => {
    try {
        const client = await MongoClient.connect('mongodb://localhost:27017', { useNewUrlParser: true, useUnifiedTopology: true });
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

app.post('/registration', async (req, res) => {
    const { name, last, company, address, city, province, email, password } = req.body;
    withDB(async (db) => {
        const newUser = await db.collection('companies').insert({
            Name: name, Last: last, Company: company, Address: address, City: city,
            Province: province, Email: email, Password: password
        });
        //DON'T FORGET TO CREATE COLLECTION FOR EACH COMPANY
        let responseServer = 'User has been created';
        res.status(200).json({ responseServer });
    }, res);
})

app.post('/addProduct', async (req, res) => {
    const data = req.body.data;
    withDB(async (db) => {
        const newAddProduct = await db.collection('products').insertOne({ data });
        let responseServer = "Product has been added";
        res.status(200).json({ responseServer })
    }, res);
})

app.get('/products', async (req, res) => {
    withDB(async (db) => {
        const products = await db.collection('products').find({}).toArray();
        // console.log("Returned data");
        res.status(200).json(products);
    }, res)
})

app.delete('/deleteProduct/:id', async (req, res) => {
    withDB(async (db) => {
        const prodId = req.params.id;
        const deleteProduct = await db.collection('products').deleteOne({ "_id": ObjectID(prodId) });
        res.status(200).json(deleteProduct);
        console.log(barcode);
    }, res)

})

app.put('/updateProduct/', async (req, res) => {

    withDB(async (db) => {
        const prodObj = req.body.payload;
        const updateProduct = await db.collection('products').updateOne({ "_id": ObjectID(prodObj._id) }, { "$set": { "data": prodObj.data } });
        res.status(200).json(updateProduct);
    }, res)
})

app.post('/emailOOS/', async (req, res) => {
    const prodObj = req.body.payload;

    var nodemailer = require('nodemailer');

    var transporter = nodemailer.createTransport({
        service: 'hotmail',
        auth: {
            user: '@hotmail.com',
            pass: ''
        }
    });

    var mailOptions = {
        from: 'patico832@hotmail.com',
        to: 'bapalacior@unal.edu.co',
        subject: 'Out Of Stock Notification',
        text: 'The product ' + prodObj.data.name + ', barcode : ' + prodObj.data.name + ' has reached the min quantity specified. (' + prodObj.data.minStock + ')'
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });

    console.log(prodObj.data);
    res.status(200);
})

app.listen(8000, () => console.log('Listening on port 8000'));