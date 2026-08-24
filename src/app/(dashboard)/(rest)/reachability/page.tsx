// SPIKE VW-425
import {
  canReach,
  lateralMovement,
  internetExposure,
} from "../../../../spikes/hawksbill/reachtool";

const ENTRY = "renal_nursing_workstation_01";
const TARGET = "renal_vitals_monitor_05";

export default async function ReachabilityPage() {
  const [checkReach, checkLateralMovement, checkInternetExposure] =
    await Promise.all([
      canReach("", ENTRY, TARGET),
      lateralMovement("", ENTRY),
      internetExposure("", ENTRY),
    ]);

  console.log("checkReach ", checkReach);
  console.log("checkLateralMovement ", checkLateralMovement);
  console.log("checkInternetExposure ", checkInternetExposure);

  return (
    <div className="mx-auto space-y-8 p-6">
      <h1 className="space-y-2">Reachability</h1>
      <section className="rounded border border-amber-300 bg-amber-50 p-3 m-3">
        <p className="font-bold italic">
          Reachability: If I inject this traffic at this ethernet port, will it
          get to this other one?
        </p>
        <p className="pt-3">
          yes, ReachTool can help to answer this, however it gives us a
          probability, not a "yes/no" answer. We can utilize the score endpoint
          and load a json file with our assets, and we tell the tool where we
          "inject". It scores every other device on how likely traffic is to
          reach it, and shows us the path it would take. So we get "0.42 likely,
          via internet - gateway - renal_router - host." In the response it also
          tells us how much it actually knows. Every answer comes with a
          confidence.
        </p>
        <p className="pt-3"><span>Example output:</span>{JSON.stringify(checkReach, null, 2)}</p>
      </section>
      <section className="rounded border border-blue-300 bg-blue-50 p-3 m-3">
        <p className="font-bold italic">
          Analyze what the blast radius of a vulnerable device is. What other
          devices could be accessible and used for lateral movement?
        </p>
        <p className="pt-3">
          Yes, we can determine risk priority by the score, with the reasoning
          output from REACHTOOL. It returns a narrative output with a
          human-readable justification, directly usable for triage ranking.
          E.g., local_risk 16 can be interpreted as "barely broken."
          blast_radius 84 - bridges 10.1.40.x and 10.1.0.x -- pivots 2 subnets,
          reaches 61 downstream assets (which subnets it bridges, how many
          assets sit downstream. It can be used by the Triage agent directly,
          without interpretation). The tool also has a multihomed flag; it
          usually explains a blast radius exceeding local risk, as it marks
          devices sitting on more than one network. So the solution could be a
          VLAN reassignment rather than a patch. How we can use it: if we know a
          critical CVE is on an isolated device, that may deserve to wait, but a
          moderate CVE on a bridge may not.
        </p>
        <p className="pt-3"><span>Example output:</span>{JSON.stringify(checkLateralMovement, null, 2)}</p>
      </section>
      <section className="rounded border border-green-300 bg-green-50 p-3 m-3">
        <p className="font-bold italic">
          Analyze if a device is reachable from the outside internet.
        </p>
        <p className="pt-3">
          This info comes in tagged with exposure: "internet". If none are
          marked, the tool infers entry points from public IPs and gateway-ish
          names, and reports that it inferred them. The tool computes whether an
          interior asset is reachable from those edges. Today that computation
          is just subnet adjacency, and we could do it ourselves. It becomes
          worth outsourcing once firewall rules are in the input.
        </p>
        <p className="pt-3"><span>Example output:</span>{JSON.stringify(checkInternetExposure, null, 2)}</p>
      </section>
      <section className="rounded border border-pink-300 bg-pink-50 p-3 m-3">
        <p className="font-bold italic" >
          Controlability: What are my options for changing reachability, both in
          terms of what traffic can be impacted by particular control point, and
          what enforcement policies are available at this control point.
        </p>
        <p className="pt-3">
          The tool is stateless, one document in -&gt one document out. So, we
          can get the same effect by editing the input and rescoring. Change one
          thing, run it again and compare. Whatever moved is what that control
          point affects.
        </p>
        <p className="font-bold pt-6 italic">
          What traffic can a particular control point impact?
        </p>
        <p className="pt-3">
          - By input mutation. We can simulate something a network team could
          actually do: - flip a rule from allow to deny in firewall rules,
          tighten an existing ACL - write a new ACL entry by adding a new deny
          rule for a pair - move the firewall to deny-by-default - remove an
          interface from an asset by reassigning a VLAN or disabling a
          switchport - remove an open port from an asset by disabling a
          service/host firewall
        </p>
      </section>
        <section className="rounded border border-grey-300 bg-grey-50 p-3 m-3">
        <p className="font-bold italic">
          Could we entrich this to contain info on what specific switches/routers are at each point? What are some of the capabilities of these devices?
        </p>
        <p className="pt-3">
Yes, network gear can be modelled as ordinary assets — make, model, and the subnets each interface sits on.

Capability-wise: no. The tool is a scoring engine over a network graph, with no notion of device models or license tiers. It represents basic filtering only (allow/deny by protocol and port).


        </p>

      </section>
    </div>
  );
}
