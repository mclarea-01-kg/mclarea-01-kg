-- 10-sample-operators-optional.sql - OPTIONAL. Gives the made-up SAMPLE rows made-up operator IDs (OP-101 to OP-112),
-- so the Operator Analysis is not empty while you are testing. Run 09-operator-name.sql first.
-- It only touches rows that have NO operator yet AND were not typed in by a person (entered_by is empty).
-- Real readings entered through the Add reading form are never changed. Safe to run twice. Deletes nothing.

update public.fuel_readings
   set operator_name = 'OP-' || (101 + (abs(hashtext(vehicle_no || shift)) % 12))
 where operator_name is null
   and entered_by is null;
