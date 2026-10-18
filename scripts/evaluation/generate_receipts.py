"""Deterministic synthetic receipts. Expected transcriptions are written before any provider call."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import json, hashlib
root = Path(__file__).resolve().parents[2] / "tests" / "receipts"
root.mkdir(parents=True, exist_ok=True)
font_path = "C:/Windows/Fonts/consola.ttf"
regular = ImageFont.truetype(font_path, 25)
large = ImageFont.truetype(font_path, 35)
small = ImageFont.truetype(font_path, 15)
hand = ImageFont.truetype("C:/Windows/Fonts/segoeuii.ttf", 30)
def receipt(merchant="Fieldnotes Cafe", date="2026-10-12", currency="USD", total="22.00", handwritten=False):
    im=Image.new("RGB",(700,900),"white"); d=ImageDraw.Draw(im)
    d.text((45,30),"SYNTHETIC EVALUATION FIXTURE - NOT A REAL PURCHASE",font=small,fill="#666666")
    d.text((45,85),merchant,font=large,fill="black")
    d.text((45,150),"Date: "+date,font=regular,fill="black")
    d.text((45,195),"Currency: "+currency,font=regular,fill="black")
    d.line((45,245,655,245),fill="black",width=2)
    rows=[("Caesar Salad","16.00"),("Grilled Salmon","28.00")] if handwritten else [("Sandwich","12.00"),("Coffee","8.00")]
    y=290
    for label, amount in rows:
        d.text((45,y),label,font=regular,fill="black");d.text((535,y),amount,font=regular,fill="black");y+=60
    subtotal, tax=("44.00","3.96") if handwritten else ("20.00","2.00")
    for y,label,amount in [(465,"Subtotal",subtotal),(515,"Tax",tax)]:
        d.text((45,y),label,font=regular,fill="black");d.text((535,y),amount,font=regular,fill="black")
    d.line((45,570,655,570),fill="black",width=2)
    d.text((45,600),"Printed total" if handwritten else "TOTAL",font=large,fill="black")
    d.text((520,600),"47.96" if handwritten else total,font=large,fill="black")
    if handwritten:
        d.text((70,685),"Addition +8.00",font=hand,fill="#163d70")
        d.text((70,745),"Final total 55.96",font=hand,fill="#163d70")
    d.text((45,845),"Receipt fixture / ClaimLens evaluation",font=small,fill="#777777")
    return im
cases=[]
def save(name,image,expected,provenance="synthetic original",format="PNG"):
    path=root/(name+(".jpg" if format=="JPEG" else ".png"))
    image.save(path,format=format)
    cases.append({"id":name,"file":path.name,"provenance":provenance,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"expected":expected})
clean=receipt()
critical={"merchant":"Fieldnotes Cafe","date":"2026-10-12","amount":22.0,"currency":"USD","inferred":False,"arithmetic":"reconciled"}
save("01-clean",clean,critical)
save("02-handwritten",receipt("Blue Harbor Bistro","2023-10-24",handwritten=True),{"merchant":"Blue Harbor Bistro","date":"2023-10-24","amount":55.96,"currency":"USD","inferred":False,"arithmetic":"reconciled","printed_total":47.96,"addition":8.0})
save("03-rotated",clean.rotate(90,expand=True),critical,"90-degree rotation of synthetic clean receipt")
save("04-cropped",clean.crop((0,250,700,570)),{"merchant":None,"date":None,"amount":None,"currency":None,"arithmetic":"unresolved"},"Crop removes header, date, currency and final total; subtotal remains")
faded=clean.copy();d=ImageDraw.Draw(faded)
for box in [(40,80,675,225),(510,590,680,650)]:d.rectangle(box,fill="white")
faded=ImageEnhance.Contrast(faded).enhance(0.12).filter(ImageFilter.GaussianBlur(1.2))
save("05-faded",faded,{"merchant":None,"date":None,"amount":None,"currency":None,"arithmetic":"unresolved"},"Merchant, date, currency and total deliberately erased before fading")
save("06-inconsistent",receipt(total="30.00"),{**critical,"amount":30.0,"arithmetic":"inconsistent"})
save("07-ambiguous-dollar",receipt(currency="$"),{**critical,"currency":"USD","inferred":True,"arithmetic":"reconciled"},"Synthetic receipt explicitly shows a currency symbol without an ISO code")
save("08-eur",receipt(currency="EUR"),{**critical,"currency":"EUR"})
reformatted=Image.new("RGB",(780,980),"#eeeeee");reformatted.paste(clean,(40,40))
save("09-reformatted-copy",reformatted.resize((858,1078)),critical,"Same synthetic receipt, padded/resized and JPEG encoded; byte hash differs",format="JPEG")
path=root/"10-exact-copy.png";path.write_bytes((root/"01-clean.png").read_bytes())
cases.append({"id":"10-exact-copy","file":path.name,"provenance":"Byte-for-byte copy of fixture 01","sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"expected":critical})
(root/"manifest.json").write_text(json.dumps({"description":"All images are synthetic test fixtures, not production receipts. Ground truth fixed before live calls. This is a small diagnostic set, not a general OCR accuracy benchmark.","cases":cases},indent=2),encoding="utf-8")
print("Prepared",len(cases),"synthetic/transformed receipts and their ground truth.")
