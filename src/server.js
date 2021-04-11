import express from "express";
import bodyParser, { json } from "body-parser";
import { MongoClient, ObjectID } from "mongodb";

const path = require("path");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const app = express();
const fs = require("fs");
const readline = require("readline");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
// const blobStream = require("blob-stream");

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "/build"))); //add to deploy

const withDB = async (operations, res, dbName) => {
  try {
    const client = await MongoClient.connect("mongodb://localhost:27017", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const db = client.db(dbName);
    await operations(db);
    client.close();
  } catch (error) {
    res.status(500).json({ message: "Error connecting to db", error });
  }
};

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  withDB(
    async (db) => {
      const user = await db
        .collection("companies")
        .findOne({ Email: email, Password: password });
      let responseServer = "no";
      if (user != null) {
        responseServer = user.Company;
      }
      res.status(200).json({ responseServer });
    },
    res,
    "quickInv"
  );
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
  } = req.body.data;
  withDB(
    async (db) => {
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
      let responseServer = "";
      if (newUser.result.ok === 1) {
        responseServer = "User has been created";
      } else {
        responseServer = "Problem adding new user";
      }
      res.status(200).json({ responseServer });
    },
    res,
    "quickInv"
  );
});

app.post("/addProduct", async (req, res) => {
  const data = req.body.data;
  withDB(
    async (db) => {
      const newAddProduct = await db.collection("products").insertOne({ data });
      let responseServer = "Product has been added";
      res.status(200).json({ responseServer });
    },
    res,
    req.body.company
  );
});

app.get("/products", async (req, res) => {
  withDB(
    async (db) => {
      const products = await db.collection("products").find({}).toArray();
      res.status(200).json(products);
    },
    res,
    req.query[0]
  );
});

app.delete("/deleteProduct/:info", async (req, res) => {
  const info = JSON.parse(req.params.info);
  withDB(
    async (db) => {
      const prodId = info.id;
      const deleteProduct = await db
        .collection("products")
        .deleteOne({ _id: ObjectID(prodId) });
      res.status(200).json(deleteProduct);
    },
    res,
    info.company
  );
});

app.put("/updateProduct/", async (req, res) => {
  withDB(
    async (db) => {
      const prodObj = req.body.payload;
      const updateProduct = await db
        .collection("products")
        .updateOne(
          { _id: ObjectID(prodObj._id) },
          { $set: { data: prodObj.data } }
        );
      res.status(200).json(updateProduct);
    },
    res,
    req.body.company
  );
});

app.post("/emailOOS/", async (req, res) => {
  const prodObj = req.body.payload;
  sentEmail(prodObj);
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
      processLineByLine(`${__dirname}/public/${myFile.name}`, res, req);
      // returing the response with file path and name
      return res.send({ name: myFile.name, path: `/public/${myFile.name}` });
    });
  } catch (error) {
    res.status(500).json({ message: "Error uploading file", error });
  }
});

async function processLineByLine(myFile, res, req) {
  try {
    const fileStream = fs.createReadStream(myFile, { start: 74 }); //skip header

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity, //to recognize all instances of CR LF('\r\n') in input.txt as a single line break.
    });

    for await (const line of rl) {
      console.log(`Line from file: ${line}`);
      withDB(
        async (db) => {
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
          const newAddProduct = await db
            .collection("products")
            .insertOne({ data });
        },
        res.status(200),
        req.body.company
      );
    }
  } catch (error) {
    console.log(error);
  }
}

app.post("/addOrder", async (req, res) => {
  const data = req.body.data;
  data["total"] = parseFloat(data["total"]);
  withDB(
    async (db) => {
      const addOrder = await db.collection("orders").insertOne({ data });
      let responseServer = "";
      if (addOrder.result.ok === 1) {
        responseServer = "Product has been added";
      } else {
        responseServer = "Problems adding order";
      }
      res.status(200).json({ responseServer });
    },
    res,
    req.body.company
  );

  //update inventory quantity
  data.products.map(async (item) => {
    withDB(
      async (db) => {
        try {
          const checkProduct = await db
            .collection("products")
            .findOne({ "data.barcode": item.barcode });
          if (checkProduct !== null) {
            checkProduct.data.quantity =
              parseInt(checkProduct.data.quantity) - parseInt(item.quantity);
            const substractQty = await db
              .collection("products")
              .updateOne(
                { _id: ObjectID(checkProduct._id) },
                { $set: { data: checkProduct.data } }
              );
            if (substractQty.result.ok === 1) {
              console.log(checkProduct.data.barcode + ": Qty substracted");
              if (checkProduct.data.quantity <= checkProduct.data.minStock) {
                console.log("an email will be sent");
                sentEmail(checkProduct);
              }
            } else {
              console.log(
                checkProduct.data.barcode + ": Problem substracting qty"
              );
            }
          } else {
            console.log(checkProduct.data.barcode + ":Product not found");
          }
        } catch (error) {
          console.log(error);
        }
      },
      res,
      req.body.company
    );
  });
});

const sentEmail = async (prodObj) => {
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

  res.status(200);
};

app.get("/orders", async (req, res) => {
  withDB(
    async (db) => {
      const orders = await db.collection("orders").find({}).toArray();
      res.status(200).json(orders);
    },
    res,
    req.query[0]
  );
});

app.delete("/deleteOrder/:info", async (req, res) => {
  const info = JSON.parse(req.params.info);
  withDB(
    async (db) => {
      const orderId = info.id;
      const deleteOrder = await db
        .collection("orders")
        .deleteOne({ _id: ObjectID(orderId) });
      res.status(200).json(deleteOrder);
    },
    res,
    info.company
  );
});

app.post("/addInvoice", async (req, res) => {
  const data = req.body.data;
  withDB(
    async (db) => {
      const addInvoice = await db.collection("invoices").insertOne({ data });
      let responseServer = "";
      if (addInvoice.result.ok === 1) {
        responseServer = "Invoice has been added";
      } else {
        responseServer = "Problems adding invoice";
      }
      res.status(200).json({ responseServer });
    },
    res,
    req.body.data.company.Company
  );
});

app.get("/invoices", async (req, res) => {
  withDB(
    async (db) => {
      const invoices = await db.collection("invoices").find({}).toArray();
      res.status(200).json(invoices);
    },
    res,
    req.query[0]
  );
});

app.get("/lastOrderId", async (req, res) => {
  withDB(
    async (db) => {
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
    },
    res,
    req.query[0]
  );
});

app.get("/customers", async (req, res) => {
  withDB(
    async (db) => {
      const customers = await db
        .collection("customers")
        .aggregate([{ $project: { Email: 0, Password: 0 } }])
        .toArray();
      res.status(200).json(customers);
      console.log(customers);
    },
    res,
    req.query[0]
  );
});

app.post("/addCustomer", async (req, res) => {
  const data = req.body.data;
  console.log(req.body.company);
  withDB(
    async (db) => {
      const addCustomer = await db.collection("customers").insertOne({ data });
      let responseServer = "";
      if (addCustomer.result.ok === 1) {
        responseServer = "Customer has been added";
      } else {
        responseServer = "Problems adding customer";
      }
      console.log(responseServer);
      res.status(200).json({ responseServer });
    },
    res,
    req.body.company
  );
});

const generateQR = async (text) => {
  try {
    await QRCode.toFile("./1001.png", text);
    // createPDF(text);
  } catch (err) {
    console.error(err);
  }
};

const createPdf = async (invoice, fileName) => {
  console.log("invoice:", invoice);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(fileName));
  const startPoint = 50;
  doc.fontSize(25).text(`Invoice # ${invoice.order.orderId}`, startPoint, 100);
  doc
    .fontSize(25)
    .text("Invoice Date: " + invoice.company.invoiceDate, startPoint, 130);

  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      160
    );

  doc
    .fontSize(12)
    .text("Customer: " + invoice.order.customer.company, startPoint, 190);
  doc
    .fontSize(12)
    .text(
      "Customer Address: " +
        invoice.order.customer.address +
        ", " +
        invoice.order.customer.city +
        ", " +
        invoice.order.customer.province,
      startPoint,
      210
    );
  doc.fontSize(12).text("Order Id: " + invoice.order.orderId, startPoint, 230);
  doc
    .fontSize(12)
    .text("Order date: " + invoice.order.orderDate, startPoint, 260);
  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      270
    );
  doc.fontSize(12).text("Sold by: " + invoice.company.Company, startPoint, 290);
  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      310
    );

  let row = 340;
  let index = 1;
  invoice.order.products.map((item) => {
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
    .text("Total: $" + invoice.order.total, startPoint + 401, row);
  doc
    .fontSize(25)
    .text(
      "----------------------------------------------------------",
      startPoint,
      (row += 20)
    );
  doc
    .image(
      `./${invoice.company.Company}-${invoice.order.orderId}.png`,
      420,
      30,
      {
        fit: [100, 100],
      }
    )
    .rect(420, 30, 100, 100)
    .stroke()
    .text("QR", 420, 0);
  doc.end();
};

app.get("/createPdf/", async (req, res) => {
  try {
    const invoice = JSON.parse(req.query.data);
    const fileName = `${__dirname}/public/${invoice.company.Company}-${invoice.order.orderId}.pdf`;
    if (fs.existsSync(fileName)) {
      res.download(fileName);
    } else {
      let stringInvoice = JSON.stringify(invoice.order.products);
      await QRCode.toFile(
        `./${invoice.company.Company}-${invoice.order.orderId}.png`,
        stringInvoice
      );
      await createPdf(invoice, fileName);
      await sleep(300);
      fs.unlink(
        `./${invoice.company.Company}-${invoice.order.orderId}.png`,
        (err) => {
          if (err) {
            console.error(err);
            return;
          }
          console.log("png file removed");
        }
      );
      res.download(fileName);
    }
  } catch (error) {
    res.status(500).json({ message: "Error creating invoice", error });
  }
});

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

app.get("/lastInvoiceId", async (req, res) => {
  withDB(
    async (db) => {
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
    },
    res,
    req.query[0]
  );
});

app.put("/updateOrder/", async (req, res) => {
  withDB(
    async (db) => {
      const prodObj = req.body.payload;
      const updateOrders = await db
        .collection("orders")
        .updateOne(
          { _id: ObjectID(prodObj._id) },
          { $set: { data: prodObj.data } }
        );
      res.status(200).json(updateOrders);
    },
    res,
    req.body.company
  );
});

//Add quantity from mobile
app.post("/addQuantity", async (req, res) => {
  const data = req.body;
  withDB(
    async (db) => {
      const checkProduct = await db
        .collection("products")
        .findOne({ "data.barcode": data.barcode });
      let responseServer = "";
      if (checkProduct !== null) {
        checkProduct.data.quantity =
          parseInt(checkProduct.data.quantity) + parseInt(data.qty);
        const addQty = await db
          .collection("products")
          .updateOne(
            { _id: ObjectID(checkProduct._id) },
            { $set: { data: checkProduct.data } }
          );
        if (addQty.result.ok === 1) {
          responseServer = "Qty added";
        } else {
          responseServer = "Problem adding qty";
        }
      } else {
        responseServer = "Product not found";
      }
      res.status(200).json({ responseServer });
    },
    res,
    data.company
  );
});

//Add products list from mobile
app.post("/addProductsList", async (req, res) => {
  const products = JSON.parse(req.body.products);

  let responseServer = "Qty added";
  await products.map(async (item) => {
    withDB(
      async (db) => {
        try {
          const checkProduct = await db
            .collection("products")
            .findOne({ "data.barcode": item.barcode });
          if (checkProduct !== null) {
            checkProduct.data.quantity =
              parseInt(checkProduct.data.quantity) + parseInt(item.quantity);
            const addQty = await db
              .collection("products")
              .updateOne(
                { _id: ObjectID(checkProduct._id) },
                { $set: { data: checkProduct.data } }
              );
            if (addQty.result.ok === 1) {
              responseServer = "Qty added";
            } else {
              responseServer = "Problem adding qty";
            }
          } else {
            responseServer = "Product not found";
          }
        } catch (error) {
          console.log(error);
        }
      },
      res,
      req.body.company
    );
  });
  res.status(200).json({ responseServer });
});

//Get popular products
app.get("/popularProds", async (req, res) => {
  withDB(
    async (db) => {
      const orders = await db
        .collection("orders")
        .aggregate([
          { $unwind: "$data.products" },
          {
            $group: {
              _id: {
                barcode: "$data.products.barcode",
                name: "$data.products.name",
              },
              count: { $sum: { $toInt: "$data.products.quantity" } },
            },
          },
          {
            $group: {
              _id: "$_id.barcode",
              values: { $push: { name: "$_id.name", count: "$count" } },
            },
          },
          { $sort: { _id: -1 } },
        ])
        .limit(5)
        .toArray();
      res.status(200).json(orders);
    },
    res,
    req.query[0]
  );
});

app.get("/productInfo", async (req, res) => {
  withDB(
    async (db) => {
      const product = await db
        .collection("products")
        .aggregate([
          { $match: { "data.name": req.query[1] } },
          {
            $project: {
              name: "$data.name",
              quantity: { $toInt: "$data.quantity" },
              minStock: { $toInt: "$data.minStock" },
            },
          },
        ])
        .limit(1)
        .toArray();
      res.status(200).json(product);
    },
    res,
    req.query[0]
  );
});

app.get("/totalSales", async (req, res) => {
  withDB(
    async (db) => {
      const totalSales = await db
        .collection("invoices")
        .aggregate([
          {
            $group: { _id: "1", total: { $sum: "$data.order.total" } },
          },
        ])
        .toArray();
      res.status(200).json(totalSales);
    },
    res,
    req.query[0]
  );
});

app.get("/salesByDate", async (req, res) => {
  withDB(
    async (db) => {
      const salesByDate = await db
        .collection("invoices")
        .aggregate([
          {
            $group: {
              _id: "$data.order.orderDate",
              total: { $sum: "$data.order.total" },
            },
          },
          {
            $sort: { _id: 1 },
          },
        ])
        .toArray();
      res.status(200).json(salesByDate);
    },
    res,
    req.query[0]
  );
});

app.get("/totalOrders", async (req, res) => {
  withDB(
    async (db) => {
      const totalOrders = await db.collection("orders").countDocuments();
      res.status(200).json({ totalOrders: totalOrders });
    },
    res,
    req.query[0]
  );
});

app.get("/totalInvoices", async (req, res) => {
  withDB(
    async (db) => {
      const totalInvoices = await db.collection("invoices").countDocuments();
      res.status(200).json({ totalInvoices: totalInvoices });
    },
    res,
    req.query[0]
  );
});

app.get("/avgOrders", async (req, res) => {
  withDB(
    async (db) => {
      const avgOrders = await db
        .collection("orders")
        .aggregate([
          {
            $group: { _id: "1", avg: { $avg: "$data.total" } },
          },
        ])
        .toArray();
      res.status(200).json(avgOrders);
    },
    res,
    req.query[0]
  );
});

app.get("/avgInvoices", async (req, res) => {
  withDB(
    async (db) => {
      const avgOrders = await db
        .collection("invoices")
        .aggregate([
          {
            $group: { _id: "1", avg: { $avg: "$data.order.total" } },
          },
        ])
        .toArray();
      res.status(200).json(avgOrders);
    },
    res,
    req.query[0]
  );
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname + "/build/index.html"));
});
app.listen(8000, () => console.log("Listening on port 8000"));
