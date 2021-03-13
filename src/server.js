import express from 'express';
import bodyParser, { json } from 'body-parser';
import { MongoClient, ObjectID } from 'mongodb';
import { start } from 'repl';

const fileUpload = require('express-fileupload');
const cors = require('cors')
const app = express();
const fs = require('fs');
const readline = require('readline');

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
            user: 'aliengo8@hotmail.com',
            pass: ''
        }
    });

    var mailOptions = {
        from: 'aliengo8@hotmail.com',
        to: 'bapalacior@unal.edu.co',
        subject: 'Out Of Stock Notification',
        text: 'The product ' + prodObj.data.name + ', barcode : ' + prodObj.data.barcode + ' has reached the min quantity specified. (' + prodObj.data.minStock + ')'
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

// middle ware
app.use(express.static('public')); //to access the files in public folder
app.use(cors()); // it enables all cors requests
app.use(fileUpload());

// file upload api
app.post('/upload', (req, res) => {
    try {
        if (!req.files) {
            return res.status(500).send({ msg: "file is not found" })
        }
        // accessing the file
        const myFile = req.files.file;
        //  mv() method places the file inside public directory
        myFile.mv(`${__dirname}/public/${myFile.name}`, function (err) {
            if (err) {
                console.log(err)
                return res.status(500).send({ msg: "Error occured" });
            }
            processLineByLine(`${__dirname}/public/${myFile.name}`, res);
            // returing the response with file path and name
            return res.send({ name: myFile.name, path: `/public/${myFile.name}` });
        });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading file', error });
    }
})

async function processLineByLine(myFile, res) {
    try {
        const fileStream = fs.createReadStream(myFile, { start: 74 });//skip header

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity //to recognize all instances of CR LF('\r\n') in input.txt as a single line break.
        });

        console.log(rl);
        for await (const line of rl) {
            console.log(`Line from file: ${line}`);
            withDB(async (db) => {
                var dataArr = line.replace(/"/g, '').split(',');
                var data = {
                    "barcode": dataArr[0], "name": dataArr[1], "quantity": dataArr[2],
                    "price": dataArr[3], "weight": dataArr[4], "minStock": dataArr[5],
                    "description": dataArr[6]
                };
                console.log(data);
                const newAddProduct = await db.collection('products').insertOne({ data });
            }, res.status(200));
        }
    }
    catch (error) {
        console.log(error);
    }
}

app.post('/addOrder', async (req, res) => {
    const data = req.body.data;
    withDB(async (db) => {
        const addOrder= await db.collection('orders').insertOne({ data });
        console.log(addOrder.result.ok);
        let responseServer = "Product has been added";
        res.status(200).json({ responseServer })
    }, res);
})

app.get('/orders', async (req, res) => {
    withDB(async (db) => {
        const orders = await db.collection('orders').find({}).toArray();
        // console.log("Returned data");
        res.status(200).json(orders);
    }, res)
})

app.listen(8000, () => console.log('Listening on port 8000'));