import base64
import hashlib
import os
import uuid
from fastapi.responses import FileResponse
import requests
import json
from PIL import Image

from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

import db

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

image_dir = "images"

if not os.path.exists(image_dir):
    os.mkdir(image_dir)

app.mount(f"/{image_dir}", StaticFiles(directory=image_dir), name=image_dir)
app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")


def save_receipt(
    filename: str, receipt: UploadFile, session: Session
) -> tuple[db.Receipt, bool]:
    """
    Saves the uploaded receipt, returns the db receipt and a flag
    indicating whether a new receipt was made
    """
    if not os.path.exists(image_dir):
        os.makedirs(image_dir)

    file_contents = receipt.file.read()
    extension = filename.split(".")[-1]
    hash = hashlib.sha256(file_contents).hexdigest()
    file_path = os.path.join(image_dir, f"{hash}.{extension}")

    # Check to see if we've already processed this file
    stmt = select(db.Receipt).where(db.Receipt.path == file_path)
    result = session.exec(stmt).first()

    if result is not None:
        return (result, False)

    _ = receipt.file.seek(0)
    with open(file_path, "wb") as rfile:
        _ = rfile.write(receipt.file.read())

    db_receipt = db.Receipt(path=file_path)
    session.add(db_receipt)
    session.flush()

    return (db_receipt, True)


def veryfi_process_receipt(receipt: db.Receipt):
    encoded = ""
    with open(receipt.path, "rb") as rfile:
        encoded = base64.b64encode(rfile.read()).decode()

    url = "https://api.veryfi.com/api/v8/partner/documents"

    payload = json.dumps({"file_data": encoded, "bounding_boxes": True})
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "CLIENT-ID": os.environ.get("CLIENT_ID"),
        "AUTHORIZATION": os.environ.get("AUTHORIZATION"),
    }

    response = requests.request("POST", url, headers=headers, data=payload)
    return response.json()


def save_veryfi_line_items(
    process_receipt_response, receipt: db.Receipt, session: Session
):
    img = Image.open(receipt.path)
    width, height = img.size
    extension = receipt.path.split(".")[-1]

    with_scores = process_receipt_response["line_items_with_scores"]

    for item in with_scores:
        bbox = item["description"]["bounding_box"]
        item_name = item["description"]["value"]
        item_price = item["total"]["value"]

        cropped = img.crop((
            bbox[1] * width,
            bbox[2] * height,
            bbox[3] * width,
            bbox[4] * height,
        ))

        filename = f"{uuid.uuid4()}.{extension}"
        path = os.path.join(image_dir, filename)

        line_item = db.ReceiptLineItem(
            path=path, price=item_price, receipt_id=receipt.id, name=item_name
        )

        session.add(line_item)

        cropped.save(path)


@app.post("/upload")
def upload_receipt(filename: str, receipt: UploadFile, session: db.SessionDep):
    db_receipt, created_new = save_receipt(filename, receipt, session)

    if not created_new:
        return db_receipt.id

    response = veryfi_process_receipt(db_receipt)
    save_veryfi_line_items(response, db_receipt, session)

    session.commit()

    return db_receipt.id


@app.get("/receipt")
def get_receipts(session: db.SessionDep) -> list[db.Receipt]:
    stmt = select(db.Receipt)
    receipts = session.exec(stmt)

    out: list[db.Receipt] = []

    for receipt in receipts:
        out.append(receipt)

    return out


@app.get("/receipt/{id}")
def get_line_items(id: int, session: db.SessionDep):
    stmt = select(db.ReceiptLineItem).where(id == db.ReceiptLineItem.receipt_id)
    results = session.exec(stmt)
    out: list[db.ReceiptLineItem] = []

    for line_item in results:
        out.append(line_item)

    return out


@app.get("/")
def index():
    return FileResponse("static/index.html")
