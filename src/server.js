import express from 'express';

const app = express();

app.get('/helloFromByron', (req, res) => res.send('hello From Byron'));

app.listen(8000, () => console.log('Listening on port 8000'));