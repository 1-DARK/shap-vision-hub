##  python3 app.py   
## npm run dev
##  ngrok http 5001
## curl -X POST https://7210-2401-4900-c235-90da-c167-b757-87f3-479a.ngrok-free.app/predict_json \ // to check
  -H "Content-Type: application/json" \
  -d '{"tenure": 12, "monthly_charges": 50}'
## supabase functions deploy predict-churn
## change the ngrok url manually in supabase





curl -X POST https://ff89-2409-40c4-214d-e99e-51b9-34f-5e93-6e17.ngrok-free.app/predict_json \ // to check
  -H "Content-Type: application/json" \
  -d '{"tenure": 12, "monthly_charges": 50}'