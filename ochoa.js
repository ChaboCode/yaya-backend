import {
    createAuthenticatedClient,
    isFinalizedGrant,
} from "@interledger/open-payments"
import { error } from "console"

export async function pay(sender, receiver, amount) {
    const walletUser = sender
    const walletReceptor = receiver
    const cantidad = amount

    //llamando al cliente
    const client = await createAuthenticatedClient({
        walletAddressUrl: "https://ilp.interledger-test.dev/pingadeburra",
        privateKey: "private.key",
        keyId: "73f3da3a-034b-4b45-a71f-79863d1fe39e",
    })

    //consultar el endpoint de cada billetera / consecion para pago entrante - wallet address
    const sendingWalletAddress = await client.walletAddress.get({
        url: walletUser,
    })
    const receivingWalletAddress = await client.walletAddress.get({
        url: walletReceptor,
    })
    console.log({ sendingWalletAddress, receivingWalletAddress })

    //consecion para el pago entrante - incoming payment
    const incomingPaymentGrant = await client.grant.request(
        {
            url: receivingWalletAddress.authServer,
        },
        {
            access_token: {
                access: [
                    {
                        type: "incoming-payment",
                        actions: ["create"],
                    },
                ],
            },
        },
    )

    if (!isFinalizedGrant(incomingPaymentGrant)) {
        throw new error("se espera se finalice la concesion")
    }

    console.log(incomingPaymentGrant)

    //crear pago entrante para el receptor
    const incomingPayment = await client.incomingPayment.create(
        {
            url: receivingWalletAddress.resourceServer,
            accessToken: incomingPaymentGrant.access_token.value,
        },
        {
            walletAddress: receivingWalletAddress.id,
            incomingAmount: {
                assetCode: receivingWalletAddress.assetCode,
                assetScale: receivingWalletAddress.assetScale,
                value: `${cantidad}00`,
            },
        },
    )
    console.log({ incomingPayment })
    //crear concesion para una cotizacion
    const quoteGrant = await client.grant.request(
        {
            url: sendingWalletAddress.authServer,
        },
        {
            access_token: {
                access: [
                    {
                        type: "quote",
                        actions: ["create"],
                    },
                ],
            },
        },
    )
    if (!isFinalizedGrant(quoteGrant)) {
        throw new error("se espera se finalice la concesion")
    }
    console.log({ quoteGrant })
    //obtener una cotizacion para el remitente

    const quote = await client.quote.create(
        {
            url: receivingWalletAddress.resourceServer,
            accessToken: quoteGrant.access_token.value,
        },
        {
            walletAddress: sendingWalletAddress.id,
            receiver: incomingPayment.id,
            method: "ilp",
        },
    )

    console.log({ quote })

    const nonce = Date.now()

    //obtener una concesion para un pago saliente
    const outgoingPaymentGrant = await client.grant.request(
        {
            url: sendingWalletAddress.authServer,
        },
        {
            access_token: {
                access: [
                    {
                        type: "outgoing-payment",
                        actions: ["create"],
                        limits: {
                            debitAmount: quote.debitAmount,
                        },
                        identifier: sendingWalletAddress.id,
                    },
                ],
            },
            interact: {
                start: ["redirect"],
                finish: {
                    method: "redirect",
                    uri: "myapp://callback", // 🙏🙏🙏
                    nonce: nonce.toString(),
                },
            },
        },
    )
    console.log({ outgoingPaymentGrant })

    // FRIST PHASE END
    return {
        id: nonce,
        client,
        outgoingPaymentGrant,
        sendingWalletAddress,
        quote,
    }
}

export async function finishPayment(
    client,
    outgoingPaymentGrant,
    sendingWalletAddress,
    quote,
    interact_ref,
) {
    //finalizar la concesion del pago saliente
    try {
        const finalized = await client.grant.continue({
            url: outgoingPaymentGrant.continue.uri,
            accessToken: outgoingPaymentGrant.continue.access_token.value,
        }, {
            interact_ref,
        })
        if (!isFinalizedGrant(finalized)) {
            throw new Error("se espera se finalice la concesion")
        }

        //continuar con la cotizacion de pago saliente
        const outgoingPayment = await client.outgoingPayment.create(
            {
                url: sendingWalletAddress.resourceServer,
                accessToken: finalized.access_token.value,
            },
            {
                walletAddress: sendingWalletAddress.id,
                quoteId: quote.id,
            },
        )

        console.log({ outgoingPayment })
        return {
            status: "ok",
        }
    } catch (e) {
        console.log(e)
    }
}
