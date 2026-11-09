-- Which product cards an answer showed (comma list, e.g. "esim,tiket"), so Admin can see what Travo is used for. Additive.
alter table travel_assistant_runs add column if not exists cards text;
