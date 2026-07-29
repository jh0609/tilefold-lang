open Js_of_ocaml

let () =
  Js.export "TilefoldRunner"
    (object%js
       method runProjectJson project_json =
         project_json |> Js.to_string |> Tilefold.Project_execution.run_json
         |> Js.string

       method runProjectJsonWithMode project_json mode =
         Tilefold.Project_execution.run_json_with_mode
           (Js.to_string project_json) ~mode:(Js.to_string mode)
         |> Js.string
    end)
