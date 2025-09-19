import express from "express"
import expressWs from "express-ws"

import { finishPayment, pay } from "./ochoa.js"

const app = express()
expressWs(app)

app.use(express.json())
app.use(express.urlencoded())

app.post("/pay", async (req, res) => {
    const { sender, receiver, amount } = req.body

    await pay(sender, receiver, amount)
    console.log("ai ta")
    res.send("ai mero")
})

const pendingPayments = {}

app.ws("/ws", (ws, req) => {
    console.log("Client connected to /ws")

    ws.on("message", async (message) => {
        const data = JSON.parse(message)
        console.log(data)

        switch (data.type) {
            case "payment_first":
                const { sender, receiver, amount } = data
                let nextStep = {}
                try {
                    nextStep = await pay(sender, receiver, amount)
                } catch (e) {
                    console.log(e)
                    ws.send('{"status": "fail"}')
                    break
                }

                pendingPayments[nextStep.id] = nextStep
                ws.send(
                    JSON.stringify({
                        id: nextStep.id,
                        redirect:
                            nextStep.outgoingPaymentGrant.interact.redirect,
                    }),
                )
                break
            case "payment_continue":
                const { id, interact_ref } = data
                const {
                    client,
                    outgoingPaymentGrant,
                    sendingWalletAddress,
                    quote,
                } = pendingPayments[id]
                const result = await finishPayment(
                    client,
                    outgoingPaymentGrant,
                    sendingWalletAddress,
                    quote,
                    interact_ref
                )
                ws.send(JSON.stringify(result))
                break
        }
    })

    ws.on("close", () => {
        console.log("Client disconnected")
    })
})

app.listen(6969, "0.0.0.0", () => {
    console.log("La tienes parada en http://localhost:6969/ 🗿👍")
})
