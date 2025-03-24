# Receipt Breakout

![](./receipt-breakout-hero.png)

Upload a receipt and break the blocks to get your money back!

## Running

1. Create a file `.env` with your Veryfi credentials
```env
CLIENT_ID="..."
AUTHORIZATION="apikey ..."
```
2. Run docker compose
```bash
docker-compose up
```
3. Play

- Use the arrow keys to move the paddle
- Find example receipts in the `example_receipts` folder
- Don't let the ball hit the bottom!
