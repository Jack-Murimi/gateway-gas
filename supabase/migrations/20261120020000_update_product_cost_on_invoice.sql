-- Automatically update product_costs when posting a supplier invoice line with a product and cost.

create or replace function public.sync_product_cost_from_invoice(
  p_product_id uuid,
  p_category text,
  p_stock_mode text,
  p_unit_cost numeric
) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if p_product_id is null or p_unit_cost is null or p_unit_cost <= 0 then
    return;
  end if;
  if public.current_user_role() not in ('admin', 'director', 'operator') then
    return;
  end if;

  if p_category = 'cylinder' then
    if p_stock_mode = 'refill' then
      insert into public.product_costs(product_id, refill_cost_kes, updated_by, updated_at)
      values (p_product_id, p_unit_cost, auth.uid(), now())
      on conflict (product_id) do update
      set refill_cost_kes = excluded.refill_cost_kes,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
    elsif p_stock_mode = 'complete' then
      insert into public.product_costs(product_id, complete_cost_kes, updated_by, updated_at)
      values (p_product_id, p_unit_cost, auth.uid(), now())
      on conflict (product_id) do update
      set complete_cost_kes = excluded.complete_cost_kes,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
    end if;
  else
    insert into public.product_costs(product_id, unit_cost_kes, updated_by, updated_at)
    values (p_product_id, p_unit_cost, auth.uid(), now())
    on conflict (product_id) do update
    set unit_cost_kes = excluded.unit_cost_kes,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end if;
end;
$$;
revoke all on function public.sync_product_cost_from_invoice(uuid, text, text, numeric) from public, anon;
grant execute on function public.sync_product_cost_from_invoice(uuid, text, text, numeric) to authenticated;

create or replace function public.post_supplier_invoice(p_invoice jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public, auth
as $$
declare
  v_id uuid := gen_random_uuid();
  v_supplier_id uuid := (p_invoice->>'supplier_id')::uuid;
  v_branch_id uuid := (p_invoice->>'branch_id')::uuid;
  v_invoice_number text := trim(coalesce(p_invoice->>'invoice_number',''));
  v_invoice_date date := coalesce((p_invoice->>'invoice_date')::date, current_date);
  v_due_date date := nullif(p_invoice->>'due_date','')::date;
  v_tax numeric(14,2) := greatest(coalesce((p_invoice->>'tax_kes')::numeric,0),0);
  v_subtotal numeric(14,2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_product record;
  v_qty numeric(14,3);
  v_unit_cost numeric(14,2);
  v_track boolean;
  v_stock_mode text;
  v_description text;
  v_inv record;
begin
  if public.current_user_role() not in ('admin','director','operator') then
    raise exception 'You are not authorised to post supplier invoices.';
  end if;
  if v_supplier_id is null or v_branch_id is null or v_invoice_number = '' then
    raise exception 'Supplier, branch and supplier invoice number are required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one invoice line.';
  end if;
  if not exists(select 1 from public.suppliers where id=v_supplier_id and is_active) then
    raise exception 'Select an active supplier.';
  end if;
  if not exists(select 1 from public.branches where id=v_branch_id and is_active) then
    raise exception 'Select an active branch.';
  end if;

  insert into public.supplier_invoices(id,supplier_id,branch_id,invoice_number,invoice_date,due_date,tax_kes,notes,created_by,posted_by)
  values(v_id,v_supplier_id,v_branch_id,v_invoice_number,v_invoice_date,v_due_date,v_tax,nullif(p_invoice->>'notes',''),auth.uid(),auth.uid());

  perform set_config('app.stock_action', 'purchase', true);
  perform set_config('app.stock_batch', v_id::text, true);
  perform set_config('app.stock_note', 'Invoice ' || v_invoice_number, true);
  perform set_config('app.stock_date', v_invoice_date::text, true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_kes')::numeric;
    v_track := coalesce((v_item->>'track_stock')::boolean,false);
    v_description := trim(coalesce(v_item->>'description',''));
    v_stock_mode := coalesce(nullif(v_item->>'stock_mode', ''), case when v_track then 'complete' else 'none' end);

    if v_qty is null or v_qty <= 0 or v_unit_cost is null or v_unit_cost < 0 or v_description = '' then
      raise exception 'Each invoice line needs a description, positive quantity and non-negative unit cost.';
    end if;
    if v_track and (v_product_id is null or v_qty <> trunc(v_qty)) then
      raise exception 'Stock-tracked lines require a product and whole-number quantity.';
    end if;
    if v_stock_mode not in ('refill', 'complete', 'none') then
      raise exception 'Invalid stock mode on invoice line.';
    end if;

    v_product := null;
    if v_product_id is not null then
      select id, name, category, brand, refill_price_kes, is_active
      into v_product
      from public.products
      where id = v_product_id;
      if not found or not v_product.is_active then
        raise exception 'An invoice line references an inactive or missing product.';
      end if;
    end if;

    v_subtotal := v_subtotal + round(v_qty * v_unit_cost,2);
    insert into public.supplier_invoice_items(invoice_id,product_id,description,quantity,unit_cost_kes,line_total_kes,track_stock,stock_mode)
    values(v_id,v_product_id,v_description,v_qty,v_unit_cost,round(v_qty*v_unit_cost,2),v_track,case when v_track then v_stock_mode else 'none' end);

    if v_product_id is not null and v_unit_cost > 0 then
      perform public.sync_product_cost_from_invoice(v_product_id, v_product.category::text, v_stock_mode, v_unit_cost);
    end if;

    if v_track then
      if v_stock_mode = 'refill' then
        select full_units, empty_units
        into v_inv
        from public.branch_inventory
        where branch_id = v_branch_id and product_id = v_product_id
        for update;

        if not found or coalesce(v_inv.empty_units, 0) < v_qty::integer then
          raise exception 'Cannot refill % x %: branch only has % empty containers available.',
            v_qty::integer, coalesce(v_product.name, v_description), coalesce(v_inv.empty_units, 0);
        end if;

        update public.branch_inventory
        set full_units = full_units + v_qty::integer,
            empty_units = empty_units - v_qty::integer,
            updated_at = now()
        where branch_id = v_branch_id and product_id = v_product_id;
      else
        insert into public.branch_inventory(branch_id,product_id,full_units,empty_units,updated_at)
        values(v_branch_id,v_product_id,v_qty::integer,0,now())
        on conflict(branch_id,product_id) do update
        set full_units = public.branch_inventory.full_units + excluded.full_units,
            updated_at = now();
      end if;
    end if;
  end loop;

  update public.supplier_invoices set subtotal_kes=v_subtotal,total_kes=v_subtotal+v_tax where id=v_id;
  return v_id;
end;
$$;
