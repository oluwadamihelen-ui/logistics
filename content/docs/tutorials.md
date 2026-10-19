# Tutorials

Step-by-step walkthroughs. Each takes five to fifteen minutes. If you installed the sample data, you can follow along as **owner@swiftdrop.test**.

## Tutorial 1: Ship your first parcel from booking to delivery

**Goal:** create a shipment, assign a rider, and complete the delivery with proof.

1. **Book it.** Go to **Shipments, New shipment.** Enter sender "Zuri Fashion", a pickup address in Ikeja, recipient "Ada Obi", and a delivery address in Lekki. Choose **State: Lagos** and the matching **City**. Add a package description and weight 2 kg.
2. **Check the price.** Choose **Preview price.** You will see which pricing rule applied and how the fee was built. Choose **Create shipment.** You land on the shipment page.
3. **Confirm.** In **Actions**, choose **Confirm.**
4. **Assign pickup.** Choose **Assign driver**, pick a rider and assign. The status becomes **Pickup assigned.**
5. **Pick up.** Choose **Mark picked up.** (A rider normally does this from the driver app.)
6. **Hub arrival.** Choose **Arrived at hub** and select the hub.
7. **Ready for dispatch,** then **Assign driver** again for the delivery leg.
8. **Start delivery.** Choose **Start delivery.** The recipient is messaged if SMS or email is set up.
9. **Complete in the driver app.** Sign in as the rider (**driver1@swiftdrop.test** in the sample data), open the task, choose **Complete delivery,** and provide the proof your settings require.
10. **Verify.** Back on the shipment page, check the timeline and proof of delivery. Open **Public tracking** to see what the customer sees.

## Tutorial 2: Set up zones and pricing

**Goal:** make sure every route you serve has a price.

1. Go to **Hubs and branches** and scroll to **Delivery zones.**
2. Choose **Add zone.** Name it "Lagos Mainland", give it a short code, and list its areas separated by commas, for example `Ikeja, Yaba, Surulere`. Add a second zone, "Lagos Island", with `Lekki, Victoria Island, Ikoyi`.
3. Go to **Pricing rules, Add rule.** Create "Mainland to Island": origin zone Lagos Mainland, destination Lagos Island, a base fee, a per-kilogram fee, and the included weight.
4. Use the **Price simulator** to test a 2 kg parcel from Ikeja to Lekki.
5. Add a **fallback rule** with no zones and a higher base fee, with the lowest priority (highest number), so unusual routes still get a price.
6. If a city is missing when booking, add it under **Cities you added**, then add it to the right zone.

**Tip:** rules are checked in priority order, lowest number first. Put specific rules first and the fallback last.

## Tutorial 3: Offer pickup at a hub

**Goal:** let a customer collect a parcel at your Lekki hub.

1. Go to **Hubs and branches, Hubs** and choose **Add hub.** Name it "Lekki Hub", enter its city, state, street address and opening hours, and tick **Customers can collect shipments here.** (For a hub you already have, choose **Enable** in its *Customer pickup* column instead.)
2. Create a shipment as usual, but under **How will the recipient receive it?** choose **Recipient collects at a hub or pickup point** and select Lekki Hub.
3. Confirm the shipment and assign a rider for the sender pickup. After pickup, choose **Arrived at hub** and select **Lekki Hub.**
4. Choose **Ready for pickup.** The recipient is sent a 6-digit code by SMS or email. If those channels are not set up, choose **Resend collection code** to show a new code on screen and read it to the recipient.
5. Choose **Hand over to recipient.** Enter the collector's name, the code, and if the shipment has cash on delivery, the amount collected at the counter. The shipment becomes **Delivered.**
6. Open **Cash on delivery** and confirm the cash shows as received at the counter, not held by a driver.

## Tutorial 4: Reconcile cash on delivery

**Goal:** make sure every naira collected reaches the office and the sender.

1. Open **Cash on delivery.** The cards show what is due, collected, held by drivers, owed to senders and disputed.
2. In **Cash held by drivers,** find a driver who has handed cash to the office. Choose **Receive cash** and enter the amount. It is applied to their oldest collections first.
3. If a collection differs from the amount due, it appears as **Disputed.** Investigate and resolve it.
4. In **Payable to senders,** a sender's available balance is the cash already received. Choose **Settle,** enter the amount and a bank reference.
5. Check **Driver settlements** for the matching driver statement.

## Tutorial 5: Run a day with the driver app

**Goal:** complete tasks on a phone, including with no signal.

1. Sign in on your phone as a driver. Add the site to your home screen from the browser menu for an app-like experience.
2. Set your status to **Online.** Allow location access so dispatch can see you.
3. Open a task, choose **Accept,** and use **Navigate** to open your maps app.
4. Switch the phone to airplane mode. Complete a delivery: enter the recipient's name, take a photo, capture a signature or enter the OTP.
5. The task shows **Pending sync.** Turn the network back on. It is sent automatically and the dispatcher sees the update.
6. Try **Failed delivery** on another task, choosing a reason and a new date.

## Tutorial 6: Invite your team and control access

1. Go to **Settings, Team and roles.**
2. Choose **Add user.** Enter name, email, role and a temporary password, and share the password securely.
3. For branch staff, set their **branch** so they only see their branch's work.
4. To fine-tune someone's access, open their entry and add or deny individual permissions.
5. Ask everyone, especially owners and admins, to turn on two-factor authentication under **My account.**

## Tutorial 7: Get a customer integrated with the API

**Goal:** let a corporate client create shipments from their own system.

1. Make sure your plan includes **API access.** Open the customer and enable their corporate account.
2. Go to **Settings, API and webhooks.** Create a key with the scopes `shipments:create`, `shipments:read` and `tracking:read`, bound to that customer. Copy the key now; it is shown only once.
3. Send a test request (replace the key and address):

```
curl -X POST https://your-domain/api/v1/shipments \
  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: order-1001" \
  -d '{"senderName":"Zuri Fashion","senderPhone":"08011112222","pickupAddress":"7 Yaba Market Rd","pickupCity":"Yaba","pickupState":"Lagos","recipientName":"Ada","recipientPhone":"08033334444","deliveryAddress":"9 Admiralty Way","deliveryCity":"Lekki","deliveryState":"Lagos","packageDescription":"Dress","weightKg":1.5,"codAmount":18000}'
```

4. Repeat the same request with the same `Idempotency-Key`. You get the same shipment back, not a duplicate.
5. Add a webhook under **API and webhooks** to receive `shipment.status_changed` events. See the API reference for how to verify the signature.

## Tutorial 8: Subscribe and turn on auto-renewal

1. Go to **Subscription.** Choose a plan and billing interval.
2. Leave "Save my card and renew automatically" ticked if you want automatic renewal. If you are changing plan mid-period, you will see the credit and the amount due before you pay.
3. Pay by card on the Paystack page. You return to the subscription page with a confirmation.
4. Under **Current plan** you now see the card (brand and last four digits) and whether auto-renewal is on. You can turn it off or remove the card at any time.
