using System;
using System.Data.SqlClient;
using System.Drawing;
using System.Windows.Forms;

namespace UltraERP
{
    public partial class FormCadastro : Form
    {
        private Label lblTitulo, lblUsuario, lblSenha;
        private TextBox txtUsuario, txtSenha;
        private Button btnCadastrar;
        private Panel painelCard;

        public FormCadastro()
        {
            InitializeComponent();
            MontarTela();
        }

        private void MontarTela()
        {
            this.Text = "UltraERP - Cadastro";
            this.Size = new Size(500, 400);
            this.BackColor = Color.FromArgb(18, 18, 18);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;

            painelCard = new Panel();
            painelCard.Size = new Size(340, 280);
            painelCard.BackColor = Color.FromArgb(30, 30, 30);
            painelCard.Location = new Point(
                (this.ClientSize.Width - painelCard.Width) / 2,
                (this.ClientSize.Height - painelCard.Height) / 2
            );
            this.Controls.Add(painelCard);

            lblTitulo = new Label();
            lblTitulo.Text = "Cadastro";
            lblTitulo.Font = new Font("Segoe UI", 20, FontStyle.Bold);
            lblTitulo.ForeColor = Color.FromArgb(99, 179, 237);
            lblTitulo.AutoSize = true;
            lblTitulo.Location = new Point((painelCard.Width - 130) / 2, 20);
            painelCard.Controls.Add(lblTitulo);

            lblUsuario = new Label();
            lblUsuario.Text = "Usuário";
            lblUsuario.Font = new Font("Segoe UI", 9);
            lblUsuario.ForeColor = Color.FromArgb(180, 180, 180);
            lblUsuario.Location = new Point(40, 90);
            lblUsuario.AutoSize = true;
            painelCard.Controls.Add(lblUsuario);

            txtUsuario = new TextBox();
            txtUsuario.Size = new Size(260, 30);
            txtUsuario.Location = new Point(40, 110);
            txtUsuario.BackColor = Color.FromArgb(45, 45, 45);
            txtUsuario.ForeColor = Color.White;
            txtUsuario.BorderStyle = BorderStyle.FixedSingle;
            txtUsuario.Font = new Font("Segoe UI", 10);
            painelCard.Controls.Add(txtUsuario);

            lblSenha = new Label();
            lblSenha.Text = "Senha";
            lblSenha.Font = new Font("Segoe UI", 9);
            lblSenha.ForeColor = Color.FromArgb(180, 180, 180);
            lblSenha.Location = new Point(40, 150);
            lblSenha.AutoSize = true;
            painelCard.Controls.Add(lblSenha);

            txtSenha = new TextBox();
            txtSenha.Size = new Size(260, 30);
            txtSenha.Location = new Point(40, 170);
            txtSenha.BackColor = Color.FromArgb(45, 45, 45);
            txtSenha.ForeColor = Color.White;
            txtSenha.BorderStyle = BorderStyle.FixedSingle;
            txtSenha.Font = new Font("Segoe UI", 10);
            txtSenha.PasswordChar = '*';
            painelCard.Controls.Add(txtSenha);

            btnCadastrar = new Button();
            btnCadastrar.Text = "Cadastrar";
            btnCadastrar.Size = new Size(260, 38);
            btnCadastrar.Location = new Point(40, 220);
            btnCadastrar.BackColor = Color.FromArgb(99, 179, 237);
            btnCadastrar.ForeColor = Color.FromArgb(18, 18, 18);
            btnCadastrar.FlatStyle = FlatStyle.Flat;
            btnCadastrar.FlatAppearance.BorderSize = 0;
            btnCadastrar.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            btnCadastrar.Cursor = Cursors.Hand;
            btnCadastrar.Click += BtnCadastrar_Click;
            painelCard.Controls.Add(btnCadastrar);
        }

        private void BtnCadastrar_Click(object sender, EventArgs e)
        {
            if (txtUsuario.Text == "" || txtSenha.Text == "")
            {
                MessageBox.Show("Preencha todos os campos!");
                return;
            }

            try
            {
                using (var con = Banco.ObterConexao())
                {
                    con.Open();
                    string query = "INSERT INTO Usuarios (Usuario, Senha) VALUES (@usuario, @senha)";
                    var cmd = new SqlCommand(query, con);
                    cmd.Parameters.AddWithValue("@usuario", txtUsuario.Text);
                    cmd.Parameters.AddWithValue("@senha", txtSenha.Text);
                    cmd.ExecuteNonQuery();
                    MessageBox.Show("Usuário cadastrado com sucesso!");
                    this.Close();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao cadastrar: " + ex.Message);
            }
        }
    }
}