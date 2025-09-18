import { createAuthenticatedClient, isFinalizedGrant } from "@interledger/open-payments";
import { error } from "console";
import * as fs from "fs";
import * as readline from 'node:readline/promises';

export async function pay(sender, receiver, amount) {

    // const walletUser = await rl.question("Introduce el nombre de tu wallet: ");
    // const walletReceptor = await rl.question("A que wallet quieres transferir? ")
    // const cantidad = await rl.question("Cuanto dinero quieres mandar en moneda del receptor? ");
    const walletUser = sender;
    const walletReceptor = receiver;
    const cantidad = amount;


    //llamando al cliente
    const privateKey = fs.readFileSync("private.key", "utf8");
    const client = await createAuthenticatedClient({
        walletAddressUrl: "https://ilp.interledger-test.dev/pingadeburra",
        privateKey: 'private.key',
        keyId: "b1457224-38ae-40eb-8799-471a8296e325"
    })
    //consultar el endpoint de cada billetera / consecion para pago entrante - wallet address
    const sendingWalletAddress = await client.walletAddress.get({
        url: `https://ilp.interledger-test.dev/${walletUser}`
    })
    const receivingWalletAddress = await client.walletAddress.get({
        url: `https://ilp.interledger-test.dev/${walletReceptor}`
    })
    console.log({sendingWalletAddress, receivingWalletAddress});

    //consecion para el pago entrante - incoming payment
    const incomingPaymentGrant = await client.grant.request(
        {
        url: receivingWalletAddress.authServer,
        },
        {
            access_token:{
                access: [
                    {
                        type: "incoming-payment",
                        actions: ["create"],
                    }
                ]
            }
        }
    );

    if(!isFinalizedGrant(incomingPaymentGrant)){
        throw new error("se espera se finalice la concesion");
    }

    console.log(incomingPaymentGrant);

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
        }
    );
    console.log({incomingPayment})
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
                    }
                ]
            }
        }
    );
    if (!isFinalizedGrant(quoteGrant)){
        throw new error("se espera se finalice la concesion");
    }
    console.log({quoteGrant});
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
        }
    );

    console.log({quote});

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
                    }
                ]
            },
            interact: {
                start: ["redirect"],
            },
        }
    );
    console.log({outgoingPaymentGrant});

    //continuar con la concesion del pago saliente
    await readline
        .createInterface({
            input: process.stdin,
            output: process.stdout
        })
        .question("Press enter para salir del pago saliente")
    //finalizar la concesion del pago saliente
    const finalized = await client.grant.continue({
        url: outgoingPaymentGrant.continue.uri,
        accessToken: outgoingPaymentGrant.continue.access_token.value,
    });
    if (!isFinalizedGrant(finalized)){
        throw new Error("se espera se finalice la concesion");
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
        }
    );

    console.log({outgoingPayment});
}
