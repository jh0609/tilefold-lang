let usage () =
  prerr_endline
    "usage:\n  tilefold example add [--trace]\n  tilefold example multiply [--trace]\n  tilefold example higher-order-function [--trace]\n  tilefold example higher-order-apply [--trace]"

let payload_to_string value =
  match Tilefold.Runtime_value.payload value with
  | Unit -> "Unit"
  | Nat nat -> "Nat(" ^ Tilefold.Nat.to_string nat ^ ")"
  | Closure closure ->
      "Closure("
      ^ Tilefold.Core_graph.Function_template_id.to_string closure.template_id
      ^ ", captures=" ^ string_of_int (List.length closure.captures) ^ ")"

let example_package = function
  | "add" -> Some (Tilefold.Program_package.Examples.add ())
  | "multiply" -> Some (Tilefold.Program_package.Examples.multiply ())
  | "higher-order-function" ->
      Some (Tilefold.Program_package.Examples.higher_order_function ())
  | "higher-order-apply" ->
      Some (Tilefold.Program_package.Examples.higher_order_apply ())
  | _ -> None

let run_example name ~trace =
  match example_package name with
  | None ->
      usage ();
      exit 2
  | Some package -> (
      match Tilefold.Program_package.run_completed package with
      | Ok { value; machine; trace = events } ->
          Printf.printf "example: %s\n" name;
          Printf.printf "result_type: %s\n"
            (Tilefold.Core_type.to_string
               (Tilefold.Program_package.result_type package));
          Printf.printf "result: %s\n" (payload_to_string value);
          Printf.printf "rewrite_count: %d\n" (List.length events);
          if trace then
            print_endline
              (Tilefold.Canonical_trace.render_completed machine value)
      | Error (Stuck { reason; _ }) ->
          Printf.eprintf "execution stuck in %s; result_missing=%b\n"
            (Tilefold.Runtime_value.Instance_id.to_string reason.instance_id)
            reason.result_missing;
          exit 1
      | Error (Run_error { error; _ }) ->
          Printf.eprintf "execution error: %s\n"
            (Tilefold.Program_package.execution_error_to_string error);
          exit 1
      | Error (Step_limit_exceeded { executed_steps; limit; _ }) ->
          Printf.eprintf "step limit exceeded: executed=%s limit=%s\n"
            (Tilefold.Nat.to_string executed_steps)
            (Tilefold.Nat.to_string limit);
          exit 1
      | Error (Completed _) ->
          Printf.eprintf "internal error: completed result returned as error\n";
          exit 1)

let () =
  match Array.to_list Sys.argv with
  | [ _; "example"; name ] -> run_example name ~trace:false
  | [ _; "example"; name; "--trace" ] -> run_example name ~trace:true
  | _ ->
      usage ();
      exit 2
