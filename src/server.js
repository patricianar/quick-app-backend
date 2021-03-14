import express from "express";
import bodyParser, { json } from "body-parser";
import { MongoClient, ObjectID } from "mongodb";
import { start } from "repl";

const fileUpload = require("express-fileupload");
const cors = require("cors");
const app = express();
const fs = require("fs");
const readline = require("readline");
const PDFDocument = require("pdfkit");

app.use(bodyParser.json());

const withDB = async (operations, res) => {
  try {
    const client = await MongoClient.connect("mongodb://localhost:27017", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const db = client.db("quickInv");
    await operations(db);
    client.close();
  } catch (error) {
    res.status(500).json({ message: "Error connecting to db", error });
  }
};

app.get("/helloFromByron", (req, res) => res.send("hello From Byron"));

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  withDB(async (db) => {
    const user = await db
      .collection("companies")
      .findOne({ Email: email, Password: password });
    let responseServer = "no";
    if (user != null) {
      responseServer = "yes";
    }
    res.status(200).json({ responseServer });
  }, res);
});

app.post("/registration", async (req, res) => {
  const {
    name,
    last,
    company,
    address,
    city,
    province,
    email,
    password,
  } = req.body;
  withDB(async (db) => {
    const newUser = await db.collection("companies").insert({
      Name: name,
      Last: last,
      Company: company,
      Address: address,
      City: city,
      Province: province,
      Email: email,
      Password: password,
    });
    //DON'T FORGET TO CREATE COLLECTION FOR EACH COMPANY
    let responseServer = "User has been created";
    res.status(200).json({ responseServer });
  }, res);
});

app.post("/addProduct", async (req, res) => {
  const data = req.body.data;
  withDB(async (db) => {
    const newAddProduct = await db.collection("products").insertOne({ data });
    let responseServer = "Product has been added";
    res.status(200).json({ responseServer });
  }, res);
});

app.get("/products", async (req, res) => {
  withDB(async (db) => {
    const products = await db.collection("products").find({}).toArray();
    // console.log("Returned data");
    res.status(200).json(products);
  }, res);
});

app.delete("/deleteProduct/:id", async (req, res) => {
  withDB(async (db) => {
    const prodId = req.params.id;
    const deleteProduct = await db
      .collection("products")
      .deleteOne({ _id: ObjectID(prodId) });
    res.status(200).json(deleteProduct);
    console.log(barcode);
  }, res);
});

app.put("/updateProduct/", async (req, res) => {
  withDB(async (db) => {
    const prodObj = req.body.payload;
    const updateProduct = await db
      .collection("products")
      .updateOne(
        { _id: ObjectID(prodObj._id) },
        { $set: { data: prodObj.data } }
      );
    res.status(200).json(updateProduct);
  }, res);
});

app.post("/emailOOS/", async (req, res) => {
  const prodObj = req.body.payload;

  var nodemailer = require("nodemailer");

  var transporter = nodemailer.createTransport({
    service: "hotmail",
    auth: {
      user: "aliengo8@hotmail.com",
      pass: "",
    },
  });

  var mailOptions = {
    from: "aliengo8@hotmail.com",
    to: "bapalacior@unal.edu.co",
    subject: "Out Of Stock Notification",
    text:
      "The product " +
      prodObj.data.name +
      ", barcode : " +
      prodObj.data.barcode +
      " has reached the min quantity specified. (" +
      prodObj.data.minStock +
      ")",
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });

  console.log(prodObj.data);
  res.status(200);
});

// middle ware
app.use(express.static("public")); //to access the files in public folder
app.use(cors()); // it enables all cors requests
app.use(fileUpload());

// file upload api
app.post("/upload", (req, res) => {
  try {
    if (!req.files) {
      return res.status(500).send({ msg: "file is not found" });
    }
    // accessing the file
    const myFile = req.files.file;
    //  mv() method places the file inside public directory
    myFile.mv(`${__dirname}/public/${myFile.name}`, function (err) {
      if (err) {
        console.log(err);
        return res.status(500).send({ msg: "Error occured" });
      }
      processLineByLine(`${__dirname}/public/${myFile.name}`, res);
      // returing the response with file path and name
      return res.send({ name: myFile.name, path: `/public/${myFile.name}` });
    });
  } catch (error) {
    res.status(500).json({ message: "Error uploading file", error });
  }
});

async function processLineByLine(myFile, res) {
  try {
    const fileStream = fs.createReadStream(myFile, { start: 74 }); //skip header

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity, //to recognize all instances of CR LF('\r\n') in input.txt as a single line break.
    });

    console.log(rl);
    for await (const line of rl) {
      console.log(`Line from file: ${line}`);
      withDB(async (db) => {
        var dataArr = line.replace(/"/g, "").split(",");
        var data = {
          barcode: dataArr[0],
          name: dataArr[1],
          quantity: dataArr[2],
          price: dataArr[3],
          weight: dataArr[4],
          minStock: dataArr[5],
          description: dataArr[6],
        };
        console.log(data);
        const newAddProduct = await db
          .collection("products")
          .insertOne({ data });
      }, res.status(200));
    }
  } catch (error) {
    console.log(error);
  }
}

app.post("/addOrder", async (req, res) => {
  const data = req.body.data;
  withDB(async (db) => {
    const addOrder = await db.collection("orders").insertOne({ data });
    let responseServer = "";
    if (addOrder.result.ok === 1) {
      responseServer = "Product has been added";
    } else {
      responseServer = "Problems adding order";
    }
    res.status(200).json({ responseServer });
  }, res);
});

app.get("/orders", async (req, res) => {
  withDB(async (db) => {
    const orders = await db.collection("orders").find({}).toArray();
    res.status(200).json(orders);
  }, res);
});

app.delete("/deleteOrder/:id", async (req, res) => {
  withDB(async (db) => {
    const orderId = req.params.id;
    const deleteOrder = await db
      .collection("orders")
      .deleteOne({ _id: ObjectID(orderId) });
    res.status(200).json(deleteOrder);
  }, res);
});

app.post("/addInvoice", async (req, res) => {
  const data = req.body.data;
  withDB(async (db) => {
    const addInvoice = await db.collection("invoices").insertOne({ data });
    let responseServer = "";
    if (addInvoice.result.ok === 1) {
      responseServer = "Invoice has been added";
    } else {
      responseServer = "Problems adding invoice";
    }
    res.status(200).json({ responseServer });
  }, res);
});

app.get("/invoices", async (req, res) => {
  withDB(async (db) => {
    const invoices = await db.collection("invoices").find({}).toArray();
    res.status(200).json(invoices);
  }, res);
});

app.get("/lastOrderId", async (req, res) => {
  withDB(async (db) => {
    const lastOrder = await db
      .collection("orders")
      .find({})
      .sort({ $natural: -1 })
      .limit(1)
      .toArray();
    let responseServer = 0;
    if (lastOrder.length > 0) {
      responseServer = parseInt(lastOrder[0].data.orderId) + 1;
    } else {
      responseServer = 1000;
    }
    res.status(200).json(responseServer);
  }, res);
});

app.post("/createPdf/", (req, res) => {
  const invoice = req.body.payload;

  const doc = new PDFDocument();

  doc.pipe(fs.createWriteStream(invoice.data.order.orderId + ".pdf"));
  const startPoint = 50;
  doc.fontSize(25).text("Invoice # 3001", startPoint, 100);
  doc
    .fontSize(25)
    .text("Invoice Date: " + invoice.data.company.invoiceDate, startPoint, 130);

  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      160
    );

  doc
    .fontSize(12)
    .text("Customer: " + invoice.data.order.customer, startPoint, 190);
  doc
    .fontSize(12)
    .text("Order Id: " + invoice.data.order.orderId, startPoint, 210);
  doc
    .fontSize(12)
    .text("Order date: " + invoice.data.order.orderDate, startPoint, 230);
  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      250
    );
  doc
    .fontSize(12)
    .text("Sold by: " + invoice.data.company.Company, startPoint, 280);
  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      300
    );

  let row = 330;
  let index = 1;
  invoice.data.order.products.map((item) => {
    doc
      .fontSize(12)
      .text(
        index +
          ". " +
          item.name +
          " - Qty: " +
          item.quantity +
          " - Unit Price: $" +
          item.price,
        startPoint,
        row
      );
    row += 20;
    index += 1;
  });
  doc
    .fontSize(12)
    .text("Total: $" + invoice.data.order.total, startPoint + 401, row);
  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      (row += 20)
    );
  doc.end();
  doc.pipe(res);
  // res.json({ path: "/file.pdf" });
});

app.get("/lastInvoiceId", async (req, res) => {
  withDB(async (db) => {
    const lastInvoice = await db
      .collection("invoices")
      .find({})
      .sort({ $natural: -1 })
      .limit(1)
      .toArray();
    let responseServer = 0;
    if (lastInvoice.length > 0) {
      responseServer = parseInt(lastInvoice[0].data.invoiceId) + 1;
    } else {
      responseServer = 5000;
    }
    res.status(200).json(responseServer);
  }, res);
});

app.put("/updateOrder/", async (req, res) => {
  withDB(async (db) => {
    const prodObj = req.body.payload;
    const updateOrders = await db
      .collection("orders")
      .updateOne(
        { _id: ObjectID(prodObj._id) },
        { $set: { data: prodObj.data } }
      );
    res.status(200).json(updateOrders);
  }, res);
});

app.listen(8000, () => console.log("Listening on port 8000"));
