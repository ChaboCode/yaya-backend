import express from 'express'
import { pay } from './ochoa.js'

const app = express()

app.use(express.json())
app.use(express.urlencoded())

app.post('/pay', async (req, res) => {
	const { sender, receiver, amount } = req.body;

	await pay(sender, receiver, amount);
	console.log('ai ta');
	res.send('ai mero');
})

app.listen(6969, () => {
	console.log('La tienes parada en http://localhost:6969/ 🗿👍');
})
